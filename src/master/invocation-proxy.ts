import DebugLogger from "debug"
import { rehydrateError } from "../common"
import { makeHot, ObservablePromise } from "../observable-promise"
import { isTransferDescriptor } from "../transferable"
import {
  ModuleMethods,
  ModuleProxy,
  ProxyableFunction,
  Worker as WorkerType
} from "../types/master"
import {
  MasterJobRunMessage,
  MasterMessageType,
  WorkerJobErrorMessage,
  WorkerJobResultMessage,
  WorkerJobStartMessage,
  WorkerMessageType
} from "../types/messages"

const debugMessages = DebugLogger("threads:master:messages")

let nextJobUID = 1

const dedupe = <T>(array: T[]): T[] => Array.from(new Set(array))

const isJobErrorMessage = (data: any): data is WorkerJobErrorMessage => data && data.type === WorkerMessageType.error
const isJobResultMessage = (data: any): data is WorkerJobResultMessage => data && data.type === WorkerMessageType.result
const isJobStartMessage = (data: any): data is WorkerJobStartMessage => data && data.type === WorkerMessageType.running

function createObservablePromiseForJob<ResultType>(worker: WorkerType, jobUID: number): ObservablePromise<ResultType> {
  let asyncType: "observable" | "promise" | undefined

  return new ObservablePromise((resolve, reject, observer) => {
    const messageHandler = ((event: MessageEvent) => {
      debugMessages("Message from worker:", event.data)
      if (!event.data || event.data.uid !== jobUID) return

      if (isJobStartMessage(event.data)) {
        asyncType = event.data.resultType
      } else if (isJobResultMessage(event.data)) {
        if (asyncType === "promise") {
          resolve(event.data.payload)
          worker.removeEventListener("message", messageHandler)
        } else {
          if (event.data.payload) {
            observer.next(event.data.payload)
          }
          if (event.data.complete) {
            observer.complete()
            worker.removeEventListener("message", messageHandler)
          }
        }
      } else if (isJobErrorMessage(event.data)) {
        const error = rehydrateError(event.data.error)
        if (asyncType === "promise" || !asyncType) {
          reject(error)
        } else {
          observer.error(error)
        }
        worker.removeEventListener("message", messageHandler)
      }
    }) as EventListener
    worker.addEventListener("message", messageHandler)
    return () => worker.removeEventListener("message", messageHandler)
  })
}

function prepareArguments(rawArgs: any[]): { args: any[], transferables: Transferable[] } {
  const args: any[] = []
  const transferables: Transferable[] = []

  for (const arg of rawArgs) {
    if (isTransferDescriptor(arg)) {
      args.push(arg.send)
      transferables.push(...arg.transferables)
    } else {
      args.push(arg)
    }
  }

  return {
    args,
    transferables: dedupe(transferables)
  }
}

export function createProxyFunction<Args extends any[], ReturnType>(worker: WorkerType, method?: string) {
  return ((...rawArgs: Args) => {
    const uid = nextJobUID++
    const { args, transferables } = prepareArguments(rawArgs)
    const runMessage: MasterJobRunMessage = {
      type: MasterMessageType.run,
      uid,
      method,
      args
    }
    debugMessages("Sending command to run function to worker:", runMessage)
    worker.postMessage(runMessage, transferables)
    return makeHot(createObservablePromiseForJob<ReturnType>(worker, uid))
  }) as any as ProxyableFunction<Args, ReturnType>
}

export function createProxyModule<Methods extends ModuleMethods>(
  worker: WorkerType,
  methodNames: string[]
): ModuleProxy<Methods> {
  const proxy: any = {}

  for (const methodName of methodNames) {
    proxy[methodName] = createProxyFunction(worker, methodName)
  }

  return proxy
}
