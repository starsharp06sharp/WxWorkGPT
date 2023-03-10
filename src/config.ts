export default {
  port: 3000,
  weork: {
    token: "token",
    encoding_aeskey: "encoding_aeskey",
    receiveid: "",
    robot_name: "GPT 机器人",
    send_msg_url: "msg_url",
    send_msg_timeout_ms: 5000,
  },
  openai: {
    api_key: "api_key",
    timeout_ms: 60000,
  },
  session: {
    session_capacity: 40,
    session_expire_interval: 1800,
    clear_session_interval: 60,
  },
};
