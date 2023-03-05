import Koa from "koa";
import bodyParser from "koa-xml-body";
import logger from "koa-logger";
import Router from "koa-router";
import xml2js from "xml2js";
import { decrypt, getSignature } from "@wecom/crypto";
import config from "./config";
import { get_chat_completion, start_session_clean_up_jobs } from "./session";
import { send_wxwork_message } from "./wxwork";

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
  const parser = new xml2js.Parser({ explicitArray: false });
  const req_message = await parser.parseStringPromise(message);

  const rtx = req_message["xml"]["From"]["Alias"];
  const chat_id = req_message["xml"]["ChatId"];
  const message_content = preprocess_message_content(
    req_message["xml"]["Text"]["Content"]
  );

  // 考虑到企业微信回调超过5s即认为失败, GPT响应远超这个时间，所以用立即返回+另起任务调用GPT+通过http发送消息的方式规避这个限制
  (async () => {
    const resp_content = await get_chat_completion(
      rtx,
      message_content,
      chat_id
    );

    send_wxwork_message(chat_id, resp_content);
  })();

  ctx.body = "";
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(config.port, () => {
  console.log(`Local: http://127.0.0.1:${config.port}`);
});

start_session_clean_up_jobs();
