import axios from "axios";
import Koa from "koa";
import config from "./config";
import xml2js from "xml2js";
import { encrypt, decrypt, getSignature } from "@wecom/crypto";

async function send_wxwork_message(
  chat_id: string,
  message: string,
  mentioneds: Array<string> = []
) {
  const data = { content: message, mentioned_list: mentioneds };
  try {
    await axios.post(
      config.weork.send_msg_url,
      {
        chatid: chat_id,
        msgtype: "text",
        text: data,
      },
      { timeout: config.weork.send_msg_timeout_ms }
    );
  } catch (error) {
    console.log(`send_wxwork_message failed:${error}`);
  }
}

function preprocess_wxwork_message_content(content: string): string {
  return content.replace(`@${config.weork.robot_name}`, "").trim();
}

interface WxWorkRequestType {
  xml: {
    WebhookUrl: string;
    ChatId: string;
    ChatType: string;
    GetChatInfoUrl: string;
    From: { UserId: string; Name: string; Alias: string };
    MsgId: string;
    MsgType: string;
    Text: { Content: string };
  };
}

interface WxworkResponseType {
  xml: {
    MsgType: string;
    VisibleToUser?: string;
    Text?: {
      Content: string;
      MentionedList?: { Item: Array<string> };
    };
  };
}

type WxWorkExtendContext = Koa.Context & {
  wxworkRequestMessage: WxWorkRequestType;
  wxworkResponseMessage: WxworkResponseType | undefined;
};

function handle_verify_callback(ctx: WxWorkExtendContext) {
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
}

async function handle_message_callback(
  ctx: WxWorkExtendContext,
  next: Koa.Next
) {
  // Check parameter
  const encrypted_req = ctx.request.body["xml"]["Encrypt"];
  const sign = ctx.query["msg_signature"];
  const timestamp = ctx.query["timestamp"];
  const nonce = ctx.query["nonce"];
  ctx.assert(typeof encrypted_req === "string", 400, "invalid xml.Encrypt");
  ctx.assert(typeof timestamp === "string", 400, "invalid timestamp");
  ctx.assert(typeof nonce === "string", 400, "invalid timestamp");

  // Verify signature
  const req_sign = getSignature(
    config.weork.token,
    timestamp,
    nonce,
    encrypted_req
  );
  ctx.assert(sign === req_sign, 403, "Invalid Signature");

  // Decrypt real message
  const { message, id } = decrypt(config.weork.encoding_aeskey, encrypted_req);
  const parser = new xml2js.Parser({ explicitArray: false });
  ctx.wxworkRequestMessage = await parser.parseStringPromise(message);

  // Support text message only
  if (ctx.wxworkRequestMessage.xml.MsgType != "text") {
    return;
  }

  await next();

  // Encode
  if (ctx.wxworkResponseMessage) {
    const builder = new xml2js.Builder();
    const resp_text = builder.buildObject(ctx.wxworkResponseMessage);
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
  }
}

async function wxwork_callback_middleware(
  ctx: WxWorkExtendContext,
  next: Koa.Next
) {
  if (ctx.method === "GET") {
    handle_verify_callback(ctx);
    ctx.status = 200;
  } else if (ctx.method === "POST") {
    await handle_message_callback(ctx, next);
    ctx.status = 200;
  } else {
    ctx.throw(501);
  }
}

export {
  send_wxwork_message,
  preprocess_wxwork_message_content,
  wxwork_callback_middleware,
  WxWorkRequestType,
  WxworkResponseType,
  WxWorkExtendContext,
};
