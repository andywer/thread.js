import { spawn, Pool, Worker } from "../../src/index"

type AdditionWorker = (a: number, b: number) => number
type HelloWorker = (text: string) => string

async function test() {
  const pool = Pool(() => spawn<HelloWorker>(new Worker("./pool-worker")))
  const results = await Promise.all([
    pool.queue(hello => hello("World")),
    pool.queue(hello => hello("World")),
    pool.queue(hello => hello("World")),
    pool.queue(hello => hello("World"))
  ])
  await pool.terminate()

  for (const result of results) {
    if (result !== "Hello, World") {
      throw Error("Unexpected result returned by pool worker: " + result)
    }
  }
}

async function test2() {
  // We also want to test if referencing multiple different workers in a module
  // built using webpack works

  const add = await spawn<AdditionWorker>(new Worker("./addition-worker"))
  const result = await add(2, 3)

  if (result !== 5) {
    throw Error("Unexpected result returned by addition worker: " + result)
  }
}

export default () => Promise.all([
  test(),
  test2()
])
