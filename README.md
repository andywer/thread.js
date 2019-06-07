<h1 align="center">threads</h1>
<p align="center">
  <a href="https://travis-ci.org/andywer/threads.js" target="_blank"><img alt="Build status" src="https://img.shields.io/travis/andywer/threads.js/v1.svg?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/threads/v/next" target="_blank"><img alt="npm (tag)" src="https://img.shields.io/npm/v/threads/next.svg?style=flat-square"></a>
</p>

Version 1.0 - Work in progress 🛠

Complete rewrite of the library with a new robust API, all functional, and all statically typed. It's still fully isomorphic – run the same code in the browser, in node.js or an electron app!

Development progress is tracked in 👉 [#100](https://github.com/andywer/threads.js/issues/100). Feel free to leave feedback there!

## Installation

```
npm install threads@next tiny-worker
```

If you don't need to support node < 12 or you only want to build for the browser then you can also not install the `tiny-worker` package. It's an optional dependency and used as a fallback if `worker_threads` are not available.

## Compatibility

#### Platform: Web (browsers)

Uses [web workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).

#### Platform: Node.js 12+

Uses native [worker threads](https://nodejs.org/api/worker_threads.html).

#### Platform: Node.js < 12

Uses [`tiny-worker`](https://github.com/avoidwork/tiny-worker) as fallback if native worker threads are not available.

## New Paradigm

We dropped inline functions support and instead focus on worker code residing in their own files.
Running inlined functions in a worker was nice for concise code samples, but offered limited value in real-world applications. Those inlined functions also had some built-in limitations that could not be overcome and that frequently got users confused.

Focussing on worker code in distinct source modules also means we are focussing on using `threads` with bundlers like Webpack or Parcel in the front-end. In a node.js context you should be able to use a bundler as well, but you probably won't need to.

These changes also mean that we shall have worker code with `import`/`require()` that works in node.js just as well as bundled in browsers.

## Usage

### Concept

```js
// master.js
import { spawn, Thread, Worker } from "threads"

async function main() {
  const add = await spawn(new Worker("./workers/add"))
  const sum = await add(2, 3)

  console.log(`2 + 3 = ${sum}`)

  await Thread.terminate(sum)
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

#### spawn()

The return value of `add()` in the master code depends on the `add()` return value in the worker:
If the function returns a promise or an observable then you can just use the return value as such in the master code. If the function returns a primitive value, expect the master function to return a promise resolving to that value.

#### expose()

You can `expose()` either a function or an object. In case of exposing an object, `spawn()` will asynchronously return an object exposing all the object's functions, following the same rules as functions directly `expose()`-ed.

### Code Samples

<details>
<summary>Basics - Function thread</summary>

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
</details>

<details>
<summary>Basics - Module thread</summary>

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
</details>

<details>
<summary>TODO: Basics - Returning observables</summary>

Just return an observable in your worker, subscribe to it in the master code. Fully transparent.
</details>

<details>
<summary>TODO: Basics - Error handling</summary>

Fully transparent. The promise in the master code's call will be rejected with the error thrown in the worker, also yielding the worker error's stack trace.
</details>

<details>
<summary>Thread pool</summary>

A `Pool` allows you to create a set of worker threads and queue thread calls. The queued tasks are pulled from the queue and executed as previous tasks have finished.

Use it if you have a lot of work to offload to other threads and don't want to drown them in a huge pile of work at once, but run it in a controlled way with limited concurrency.

```js
import { spawn, Pool } from "threads"

const pool = Pool(() => spawn(new Worker("./workers/multiplier")), 8 /* optional size */)

pool.events.subscribe(console.log)

await pool.queue(async multiplier => {
  const multiplied = await multiplier(2, 3)
  console.log(`2 * 3 = ${multiplied}`)

  // When this async call completes, the worker thread (`multiplier`) will
  // be marked as available for new work scheduled via `pool.queue()`
})

await pool.terminate()
```

Note that `pool.queue()` will schedule a task to be run in a deferred way. It might execute straight away or it might take a while until a new worker thread becomes available.

The promise returned by `pool.queue()` will resolve once the scheduled callback has been executed and completed. A failing scheduled callback will also make the promise returned by `pool.queue()` reject.

</details>

<details>
<summary>Transferable objects</summary>
Use `Transfer()` to mark [`transferable objects`](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#Passing_data_by_transferring_ownership_(transferable_objects)) like ArrayBuffers to be transferred to the receiving thread. It can speed up your code a lot if you are working with big chunks of binary data.

`Transfer()` comes in two flavors:
* `Transfer(myBuffer: Transferable)`
* `Transfer(someObjectOrArrayContainingMyBuffers: any, [myBuffer, /* ... */]: Transferable[])`

Use it when calling a thread function or returning from a thread function:

```js
// master.js
import { spawn, Transfer, Worker } from "threads"

const xorBuffer = await spawn(new Worker("./workers/arraybuffer-xor"))
const resultBuffer = await xorBuffer(Transfer(testData), 127)
```

```js
// workers/arraybuffer-xor.js
import { expose, Transfer } from "threads/worker"

expose(function xorBuffer(username) {
  const view = new Uint8Array(buffer)
  view.forEach((byte, offset) => view.set([byte ^ value], offset))
  return Transfer(buffer)
})
```

Without `Transfer()` the buffers would be copied on every call and every return. Using `Transfer()` only their ownership is transferred to the other thread instead to make sure it is accessible in a thread-safe way. This is a much faster operation.
</details>

<details>
<summary>TODO: Cancelling a thread job</summary>
</details>

<details>
<summary>TODO: Subscribe to thread debugging events</summary>
</details>

<details>
<summary>Tests</summary>

Check out the [integration tests](./test) and [their workers](./test/workers) to see it in action.
</details>

### Usage with node.js

Works out of the box. Note that we wrap the native `Worker`, so `new Worker("./foo/bar")` will resolve the path relative to the module that calls it, not relative to the current working directory.

That aligns it with the behavior when bundling the code with webpack or parcel.

### Usage with Webpack

Use with the [`worker-plugin`](https://github.com/GoogleChromeLabs/worker-plugin), so all `new Worker("./unbundled-path")` expressions are detected and properly transformed transparently, so you don't need to explicitly use the `worker-loader` or define extra entry points.

TODO

### Usage with Parcel

Should work out of the box without any extra plugins.

The only adjustment you need to do is to import `threads/register` once in the beginning (in the master code, not in the thread) to register the library's `Worker` for your platform as the global `Worker`.

This is necessary, since you cannot `import { Worker } from "threads"` or Parcel won't recognize `new Worker()` as a web worker anymore.

TODO

## API

TODO

## Debug

We are using the [`debug`](https://github.com/visionmedia/debug) package to provide opt-in debug logging. All the package's debug messages have a scope starting with `threads:`, with different sub-scopes.

Set it to `DEBUG=threads:*` to enable all the library's debug logging. To run its tests with full debug logging, for instance:

```
DEBUG=threads:* npm test
```

## License

MIT
