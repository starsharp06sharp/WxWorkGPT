import Koa from "koa";
import bodyParser from "koa-xml-body";
import logger from "koa-logger";
import Router from "koa-router";
import xml2js from "xml2js";
import config from "./config";
import { encrypt, decrypt, getSignature } from "@wecom/crypto";

const app = new Koa();

app.use(bodyParser());

app.use(logger());

const router = new Router();

router.get("/", async (ctx: Koa.Context) => {
  const body = ctx.request.body;
  const sign = ctx.query["msg_signature"];
  const timestamp = ctx.query["timestamp"];
  const nonce = ctx.query["nonce"];
  ctx.assert(typeof timestamp === "string", 400, "invalid timestamp");
  ctx.assert(typeof nonce === "string", 400, "invalid timestamp");

  const decoded_sign = getSignature(config.weork.token, timestamp, nonce, body);
  ctx.assert(sign === decoded_sign, 403, "Invalid Signature");

  const { message, id } = decrypt(config.weork.encoding_aeskey, body);
  console.log(`====== VerifyURL: ${id}:${message} ======`);
  ctx.body = message;
});

router.post("/", async (ctx) => {
  const body = ctx.request.body;
  const sign = ctx.query["msg_signature"];
  const timestamp = ctx.query["timestamp"];
  const nonce = ctx.query["nonce"];
  console.log(`====== request type:${ctx.request.type} ======`);
  console.log(`sign:${sign}, timestamp:${timestamp}, nonce:${nonce}`);
  console.log(body);
  console.log("====== End ======");

  // const builder = new xml2js.Builder();
  // ctx.type = ctx.request.type;
  // ctx.body = builder.buildObject(ctx.request.body);
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(config.port, () => {
  console.log(`Local: http://127.0.0.1:${config.port}`);
});
