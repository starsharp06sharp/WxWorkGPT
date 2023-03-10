import Koa from "koa";
import logger from "koa-logger";
import bodyParser from "koa-xml-body";
import config from "./config";
import {
  get_chat_completion,
  start_session_clean_up_jobs,
  get_session_system_message,
  set_session_system_message,
} from "./session";
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

class CommandInfo {
  name = "";
  message = "";
}

function get_command_info_if_has(message_content: string): CommandInfo | null {
  if (!message_content.startsWith("#")) {
    return null;
  }
  const split_index_half_width = message_content.indexOf(":");
  const split_index_full_width = message_content.indexOf("：");
  // no separator
  if (split_index_half_width === -1 && split_index_full_width === -1) {
    return { name: message_content.slice(1), message: "" };
  }

  let split_index = Math.min(split_index_half_width, split_index_full_width);
  // full with separator only
  if (split_index_half_width === -1) {
    split_index = split_index_full_width;
  }
  // half with separator only
  if (split_index_full_width === -1) {
    split_index = split_index_half_width;
  }

  return {
    name: message_content.slice(1, split_index),
    message: message_content.slice(split_index + 1).trim(),
  };
}

const help_message = `所有命令都以#开头，格式：
#{命令名}:{(可选)命令参数}
命令列表
· help: 显示此帮助
· get-sys: 显示当前聊天的系统指示，该指示指导机器人在整个对话中的行为
· set-sys: 设置当前聊天的系统指示，注意该命令会清除本群(单聊)的对话历史
`;

function handle_command_message(
  rtx: string,
  message_content: string,
  chat_id: string,
  chat_type: string
): string | null {
  const cmd_info = get_command_info_if_has(message_content);
  if (cmd_info === null) {
    return null;
  }
  switch (cmd_info.name) {
    case "help":
      return help_message;
      break;
    case "get-sys":
      return `当前系统指示为:${get_session_system_message(chat_id)}`;
      break;
    case "set-sys":
      set_session_system_message(chat_id, cmd_info.message);
      return "设置系统指示成功";
      break;
  }
  return "Sorry, 我不懂你的命令，请参照帮助：\n" + help_message;
}

app.use(async (ctx: WxWorkExtendContext) => {
  const rtx = ctx.wxworkRequestMessage.xml.From.Alias;
  const chat_id = ctx.wxworkRequestMessage.xml.ChatId;
  const chat_type = ctx.wxworkRequestMessage.xml.ChatType;
  const message_content = preprocess_wxwork_message_content(
    ctx.wxworkRequestMessage.xml.Text.Content
  );

  // 处理命令
  const resp_content = handle_command_message(
    rtx,
    message_content,
    chat_id,
    chat_type
  );
  if (resp_content !== null) {
    console.log(`======REQ:${message_content}`);
    console.log(`======RESP:${resp_content}`);
    ctx.wxworkResponseMessage = {
      xml: {
        MsgType: "text",
        Text: {
          Content: resp_content,
        },
      },
    };
    return;
  }

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
