/// <reference no-default-lib="true"/>
/// <reference types="../../types/webworker" />
// tslint:disable no-shadowed-variable

import { AbstractedWorkerAPI } from "../types/worker"

const isWorkerRuntime: AbstractedWorkerAPI["isWorkerRuntime"] = function isWorkerRuntime() {
  return typeof self !== "undefined" && self.postMessage ? true : false
}

const postMessageToMaster: AbstractedWorkerAPI["postMessageToMaster"] = function postMessageToMaster(data, transferList?) {
  self.postMessage(data, transferList)
}

const subscribeToMasterMessages: AbstractedWorkerAPI["subscribeToMasterMessages"] = function subscribeToMasterMessages(onMessage) {
  const messageHandler = (messageEvent: MessageEvent) => {
    onMessage(messageEvent.data)
  }
  const unsubscribe = () => {
    self.removeEventListener("message", messageHandler as EventListener)
  }
  self.addEventListener("message", messageHandler as EventListener)
  return unsubscribe
}

export default {
  isWorkerRuntime,
  postMessageToMaster,
  subscribeToMasterMessages
}
