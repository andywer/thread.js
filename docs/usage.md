---
layout: article
title: Basic usage
permalink: /usage
excerpt: How to use the threads.js API.
sidebar:
  nav: sidebar
aside:
  toc: true
---

## Basics

A trivial worker example to demo the two most important functions provided by threads.js: `spawn()` and `expose()`.

```js
// master.js
import { spawn, Thread, Worker } from "threads"

async function main() {
  const add = await spawn(new Worker("./workers/add"))
  const sum = await add(2, 3)

  console.log(`2 + 3 = ${sum}`)

  await Thread.terminate(add)
}

main().catch(console.error)
```

```js
// workers/add.js
import { expose } from "threads/worker"

expose(function add(a, b) {
  return a + b
})
```

### spawn()

The return value of `add()` in the master code depends on the `add()` return value in the worker:

If the function returns a promise or an observable, then in the master code you will receive a promise or observable that proxies the one returned by the thread function.

If the function returns a primitive value, expect the master thread function to return a promise resolving to that value.

### expose()

Use `expose()` to make either a function or an object callable from the master thread.

In case of exposing an object, `spawn()` will asynchronously return an object exposing all the object's functions, following the same rules as functions directly `expose()`-ed.

## Using workers

### Function worker

This is one of two kinds of workers. A function worker exposes a single function that can be called from the master thread.

```js
// master.js
import { spawn, Thread, Worker } from "threads"

const fetchGithubProfile = await spawn(new Worker("./workers/fetch-github-profile"))
const andywer = await fetchGithubProfile("andywer")

console.log(`User "andywer" has signed up on ${new Date(andywer.created_at).toLocaleString()}`)

await Thread.terminate(fetchGithubProfile)
```

```js
// workers/fetch-github-profile.js
import fetch from "isomorphic-fetch"
import { expose } from "threads/worker"

expose(async function fetchGithubProfile(username) {
  const response = await fetch(`https://api.github.com/users/${username}`)
  return response.json()
})
```

### Module worker

This is the second kind of worker. A module worker exposes an object whose values are functions. Use it if you want your worker to expose more than one function.

```js
// master.js
import { spawn, Thread, Worker } from "threads"

const counter = await spawn(new Worker("./workers/counter"))
await counter.increment()
await counter.increment()
await counter.decrement()

console.log(`Counter is now at ${await counter.getCount()}`)

await Thread.terminate(counter)
```

```js
// workers/counter.js
import { expose } from "threads/worker"

let currentCount = 0

const counter = {
  getCount() {
    return currentCount
  },
  increment() {
    return ++currentCount
  },
  decrement() {
    return --currentCount
  }
}

expose(counter)
```

### Error handling

Works fully transparent - the promise in the master code's call will be rejected with the error thrown in the worker, also yielding the worker error's stack trace.

```js
// master.js
import { spawn, Thread, Worker } from "threads"

const counter = await spawn(new Worker("./workers/counter"))

try {
  await counter.increment()
  await counter.increment()
  await counter.decrement()

  console.log(`Counter is now at ${await counter.getCount()}`)
} catch (error) {
  console.error("Counter thread errored:", error)
} finally {
  await Thread.terminate(counter)
}
```

## Blob workers

Sometimes you need to ship master and worker code in a single file. There is an alternative way to create a worker for those situations, allowing you to inline the worker code in the master code.

The `BlobWorker` class works just like the regular `Worker` class, but instead of taking a path to a worker, the constructor takes the worker source code as a binary blob.

There is also a convenience function `BlobWorker.fromText()` that creates a new `BlobWorker`, but allows you to pass a source string instead of a binary buffer.

Here is a webpack-based example, leveraging the `raw-loader` to inline the worker code. 

```js
import { spawn, BlobWorker } from "threads"
import MyWorkerNode from "raw-loader!../dist/worker.node/worker.js"
import MyWorkerWeb from "raw-loader!../dist/worker.web/worker.js"

const MyWorker = process.browser ? MyWorkerWeb : MyWorkerNode

const worker = await spawn(BlobWorker.fromText(MyWorker))
// Now use this worker as always
```

This can be used with a two-config webpack configuration to create the single bundle. The first config builds the worker and the second builds the library that uses it. The two are built sequentially using the `WaitPlugin` described in [this article](https://www.viget.com/articles/run-multiple-webpack-configs-sequentially/). Example `webpack.config.js`:

```js
class WaitPlugin extends WebpackBeforeBuildPlugin {
  // see https://www.viget.com/articles/run-multiple-webpack-configs-sequentially/
  // for implementation
}

const workerConfig = {
  output: {
    filename: 'worker.js',
    path: path.resolve(__dirname, 'dist'),
  },
  entry: path.resolve(__dirname, 'src/worker'),
  target: 'webworker',
  plugins: [new UnminifiedWebpackPlugin(), new ThreadsPlugin()],
};

const libraryConfig = {
  output: {
    filename: 'library.min.js',
    library: 'library',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    writeToDisk: true,  // necessary to ensure worker gets built and incorporated
  },
  ...
  plugins: [
    new ThreadsPlugin(),
    new WaitPlugin('dist/worker.js'), // wait for the worker to get built
  ],
}

module.exports = [workerConfig, libraryConfig];

```

Bundle this module and you will obtain a stand-alone bundle that has its worker inlined. This is particularly useful for libraries using threads.js.

## TypeScript

### Type-safe workers

When using TypeScript you can declare the type of a `spawn()`-ed worker:

```ts
// master.ts
import { spawn, Thread, Worker } from "threads"

type HashFunction = (input: string) => Promise<string>

const sha512 = await spawn<HashFunction>(new Worker("./workers/sha512"))
const hashed = await sha512("abcdef")
```

It's also easy to export the type from the worker module and use it when `spawn()`-ing:

```ts
// master.ts
import { spawn, Thread, Worker } from "threads"
import { Counter } from "./workers/counter"

const counter = await spawn<Counter>(new Worker("./workers/counter"))
console.log(`Initial counter: ${await counter.getCount()}`)

await counter.increment()
console.log(`Updated counter: ${await counter.getCount()}`)

await Thread.terminate(counter)
```

```ts
// counter.ts
import { expose } from "threads/worker"

let currentCount = 0

const counter = {
  getCount() {
    return currentCount
  },
  increment() {
    return ++currentCount
  },
  decrement() {
    return --currentCount
  }
}

export type Counter = typeof counter

expose(counter)
```

### TypeScript workers in node.js

You can spawn `*.ts` workers out-of-the-box without prior transpiling if <a href="https://github.com/TypeStrong/ts-node" rel="nofollow">ts-node</a> is installed.

If the path passed to `new Worker()` resolves to a `*.ts` file, threads.js will check if `ts-node` is available. If so, it will create an in-memory module that wraps the actual worker module and initializes `ts-node` before running the worker code. *It is likely you will have to increase the THREADS_WORKER_INIT_TIMEOUT environment variable (milliseconds, default 10000) to account for the longer ts-node startup time if you see timeouts spawning threads.*

In case `ts-node` is not available, `new Worker()` will attempt to load the same file, but with a `*.js` extension. It is then in your hands to transpile the worker module before running the code.

### TypeScript workers in webpack

When building your app with webpack, the module path will automatically be replaced with the path of the worker's resulting bundle file.
