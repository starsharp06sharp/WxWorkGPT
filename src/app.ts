import Koa from "koa";
import logger from "koa-logger";
import bodyParser from "koa-xml-body";
import config from "./config";
import { get_chat_completion, start_session_clean_up_jobs } from "./session";
import {
  send_wxwork_message,
  wxwork_callback_middleware,
  preprocess_wxwork_message_content,
  WxWorkExtendContext,
} from "./wxwork";

const app = new Koa();

app
  .use(bodyParser({ xmlOptions: { explicitArray: false } }))
  .use(wxwork_callback_middleware)
  .use(logger());

app.use(async (ctx: WxWorkExtendContext) => {
  const rtx = ctx.wxworkRequestMessage.xml.From.Alias;
  const chat_id = ctx.wxworkRequestMessage.xml.ChatId;
  const chat_type = ctx.wxworkRequestMessage.xml.ChatType;
  const message_content = preprocess_wxwork_message_content(
    ctx.wxworkRequestMessage.xml.Text.Content
  );

  // 考虑到企业微信回调超过5s即认为失败, GPT响应远超这个时间，所以用立即返回+另起任务调用GPT+通过http发送消息的方式规避这个限制
  (async () => {
    const resp_content = await get_chat_completion(
      rtx,
      message_content,
      chat_id,
      chat_type
    );

    send_wxwork_message(chat_id, resp_content);
  })();
});

app.listen(config.port, () => {
  console.log(`Local: http://127.0.0.1:${config.port}`);
});

start_session_clean_up_jobs();
