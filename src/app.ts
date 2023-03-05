import { Configuration, OpenAIApi } from "openai";
import Koa from "koa";
import bodyParser from "koa-xml-body";
import logger from "koa-logger";
import Router from "koa-router";
import xml2js from "xml2js";
import { encrypt, decrypt, getSignature } from "@wecom/crypto";
import config from "./config";

const app = new Koa();

app.use(bodyParser({ xmlOptions: { explicitArray: false } }));

app.use(logger());

const router = new Router();

router.get("/callback/wework", async (ctx: Koa.Context) => {
  const echostr = ctx.query["echostr"];
  const sign = ctx.query["msg_signature"];
  const timestamp = ctx.query["timestamp"];
  const nonce = ctx.query["nonce"];
  ctx.assert(typeof echostr === "string", 400, "invalid echostr");
  ctx.assert(typeof timestamp === "string", 400, "invalid timestamp");
  ctx.assert(typeof nonce === "string", 400, "invalid timestamp");

  const req_sign = getSignature(config.weork.token, timestamp, nonce, echostr);
  ctx.assert(sign === req_sign, 403, "Invalid Signature");

  const { message } = decrypt(config.weork.encoding_aeskey, echostr);
  ctx.body = message;
});

function preprocess_message_content(content: string): string {
  return content.replace(`@${config.weork.robot_name}`, "").trim();
}

const configuration = new Configuration({
  apiKey: config.openai.api_key,
});
const openai = new OpenAIApi(configuration);

async function get_chat_completion(
  rtx: string,
  message_content: string,
  chat_id: string
) {
  try {
    const completion = await openai.createChatCompletion(
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message_content, name: rtx }],
      },
      { timeout: config.openai.timeout_ms }
    );
    if (
      completion.data.choices.length === 0 ||
      typeof completion.data.choices[0].message === "undefined"
    ) {
      console.log(
        `createChatCompletion result empty:${completion.data.choices}`
      );
      return "ERROR: 请求OpenAI失败 返回结果为空";
    }
    return completion.data.choices[0].message.content.trim();
  } catch (error) {
    console.log(`get_chat_completion failed: ${error}`);
    return `ERROR: 请求OpenAI失败:${error}`;
  }
}

router.post("/callback/wework", async (ctx: Koa.Context) => {
  const encrypted_req = ctx.request.body["xml"]["Encrypt"];
  const sign = ctx.query["msg_signature"];
  const timestamp = ctx.query["timestamp"];
  const nonce = ctx.query["nonce"];
  ctx.assert(typeof encrypted_req === "string", 400, "invalid xml.Encrypt");
  ctx.assert(typeof timestamp === "string", 400, "invalid timestamp");
  ctx.assert(typeof nonce === "string", 400, "invalid timestamp");

  const req_sign = getSignature(
    config.weork.token,
    timestamp,
    nonce,
    encrypted_req
  );
  ctx.assert(sign === req_sign, 403, "Invalid Signature");

  const { message, id } = decrypt(config.weork.encoding_aeskey, encrypted_req);
  console.log("====== Chat ======");
  console.log(message);
  const parser = new xml2js.Parser({ explicitArray: false });
  const req_message = await parser.parseStringPromise(message);

  console.log(req_message["xml"]);
  const rtx = req_message["xml"]["From"]["Alias"];
  const chat_id = req_message["xml"]["ChatId"];
  const message_content = preprocess_message_content(
    req_message["xml"]["Text"]["Content"]
  );
  const resp_content = await get_chat_completion(rtx, message_content, chat_id);

  const resp_message = {
    xml: {
      MsgType: "text",
      Text: {
        Content: resp_content,
      },
    },
  };

  const builder = new xml2js.Builder();
  const resp_text = builder.buildObject(resp_message);
  console.log(resp_text);
  const encrypted_resp = encrypt(config.weork.encoding_aeskey, resp_text, id);
  const resp_sign = getSignature(
    config.weork.token,
    timestamp,
    nonce,
    encrypted_resp
  );
  ctx.type = ctx.request.type;
  ctx.body = builder.buildObject({
    xml: {
      Encrypt: encrypted_resp,
      MsgSignature: resp_sign,
      TimeStamp: timestamp,
      Nonce: nonce,
    },
  });
  console.log(ctx.body);
  console.log("====== End ======");
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(config.port, () => {
  console.log(`Local: http://127.0.0.1:${config.port}`);
});
