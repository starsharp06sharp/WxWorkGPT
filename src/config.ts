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
    timeout_ms: 30000,
  },
  session: {
    session_capacity: 64,
    session_expire_interval: 600,
    clear_session_interval: 60,
  },
};

