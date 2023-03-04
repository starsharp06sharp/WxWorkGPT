import Koa from "koa";
import bodyParser from "koa-xml-body";
import logger from "koa-logger";
import Router from "koa-router";
import xml2js from "xml2js";
import config from "./config";
import { encrypt, decrypt, getSignature } from "@wecom/crypto";

const app = new Koa();

app.use(bodyParser({xmlOptions: {explicitArray: false}}));

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

function preprocess_message_content(content: string) : string {
  return content.replace(`@${config.weork.robot_name}`, '').trim();
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
  const parser = new xml2js.Parser({explicitArray: false});
  const req_message = await parser.parseStringPromise(message);

  // TODO: await 处理 message_body
  console.log(req_message["xml"]["Text"]);
  const message_content = preprocess_message_content(req_message["xml"]["Text"]["Content"]);

  const resp_message = {
    xml: {
      MsgType: "text",
      Text: {
        Content: `ECHO:${message_content}`,
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
