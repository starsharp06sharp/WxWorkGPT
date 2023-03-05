import {
  Configuration,
  OpenAIApi,
  ChatCompletionRequestMessage,
  ChatCompletionResponseMessage,
} from "openai";
import config from "./config";

class Session {
  public trim_messages() {
    while (this.messages.length > config.session.session_capacity) {
      this.messages.splice(0, 2);
    }
  }

  public expired(): boolean {
    return (
      Date.now() - this.update_time_ms >
      config.session.session_expire_interval * 1000
    );
  }

  public push_message(
    req_message: ChatCompletionRequestMessage,
    resp_message: ChatCompletionResponseMessage
  ) {
    this.messages.push(req_message);
    this.messages.push({
      role: resp_message.role,
      content: resp_message.content,
    });
    this.trim_messages();
    this.update_time_ms = Date.now();
  }

  public get_messages4completion(): Array<ChatCompletionRequestMessage> {
    this.trim_messages();
    return this.messages;
  }

  private update_time_ms = Date.now();
  private messages: Array<ChatCompletionRequestMessage> = [];
}

const session_map: Map<string, Session> = new Map();

function get_session(chat_id: string): Session {
  let val = session_map.get(chat_id);
  if (val === undefined) {
    val = new Session();
    session_map.set(chat_id, val);
  }
  return val;
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
  const req_message: ChatCompletionRequestMessage = {
    role: "user",
    content: message_content,
    name: rtx,
  };
  const messages = get_session(chat_id)
    .get_messages4completion()
    .concat(req_message);
  console.log(`======Request Messages:${JSON.stringify(messages)}`);
  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messages,
    });
    if (
      completion.data.choices.length === 0 ||
      typeof completion.data.choices[0].message === "undefined"
    ) {
      console.log(
        `createChatCompletion result empty:${completion.data.choices}`
      );
      return "ERROR: 请求OpenAI失败 返回结果为空";
    }
    const resp_message = completion.data.choices[0].message;
    // 先去除首尾空格再保存/输出
    resp_message.content = resp_message.content.trim();
    get_session(chat_id).push_message(req_message, resp_message);
    console.log(`Tokens: ${completion.data.usage}`);
    console.log(`Response Message:${JSON.stringify(resp_message)}======`);
    return resp_message.content;
  } catch (error) {
    console.log(`get_chat_completion failed: ${error}`);
    return `ERROR: 请求OpenAI失败:${error}`;
  }
}

function start_session_clean_up_jobs() {
  function do_clean_up_session() {
    for (const [key, value] of session_map) {
      if (value.expired()) {
        session_map.delete(key);
        continue;
      }
      value.trim_messages();
    }
  }

  setInterval(
    do_clean_up_session,
    config.session.clear_session_interval * 1000
  );
  console.log("Start session clean_up jobs...");
}

export { get_chat_completion, start_session_clean_up_jobs };