// always use a random websocket generated by UUID
import uuid from "uuid/v4";

// PRODUCTION ASYNC
export const WebSocketURL =
  "wss://open.senrigan.io/ws/async/writeup/gpt2_medium/session/" + uuid() + "/";

//PRODUCTION DUMMY SOCKET
//export const WebSocketURL =
//  "wss://open.senrigan.io/ws/test/writeup/gpt2_medium/session/writeup/";

// LOCAL DEVELOPER ASYNC
//export const WebSocketURL =
//  "ws://127.0.0.1:8008/ws/async/writeup/gpt2_medium/session/" + uuid() + "/";

// LOCAL DEVELOPER DUMMY ASYNC
//export const WebSocketURL =
//  "ws://127.0.0.1:8008/ws/test/writeup/gpt2_medium/session/" + uuid() + "/";
// these are cached for a day to have a much faster loading time for the user

export const PROMPTS_TO_USE = [
  "The software innovations in the 20th century ",
  "Climate change has ",
  "The breakthrough in ",
  "Cancer research has revolutionized ",
  "Recent developments in ",
  "BANG! The earthquake shattered ",
  "We know now that ",
  "Nikola Tesla's inventions have ",
  "We must take action! ",
  "SpaceX's recent landing ",
  "I had my first "
];

export const SPECIAL_CHARACTERS = [",", "!", ".", '"', "-", "'"];
