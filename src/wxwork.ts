import axios from "axios";
import config from "./config";

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

export { send_wxwork_message };
