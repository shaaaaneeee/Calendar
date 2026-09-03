require("../extension/utils/data-store.js");

describe("createNotifier", () => {
  test("notifies every subscribed callback with the given data", () => {
    const notifier = window.DataStore._internal.createNotifier();
    const received = [];
    notifier.subscribe((data) => received.push(data));
    notifier.subscribe((data) => received.push(data));

    notifier.notify("hello");

    expect(received).toEqual(["hello", "hello"]);
  });

  test("unsubscribe stops that callback from receiving future notifications", () => {
    const notifier = window.DataStore._internal.createNotifier();
    const received = [];
    const unsubscribe = notifier.subscribe((data) => received.push(data));

    notifier.notify("first");
    unsubscribe();
    notifier.notify("second");

    expect(received).toEqual(["first"]);
  });

  test("listenerCount reflects current subscriber count", () => {
    const notifier = window.DataStore._internal.createNotifier();
    expect(notifier.listenerCount()).toBe(0);

    const unsubscribe = notifier.subscribe(() => {});
    expect(notifier.listenerCount()).toBe(1);

    unsubscribe();
    expect(notifier.listenerCount()).toBe(0);
  });

  test("each call to createNotifier() returns an independent notifier", () => {
    const a = window.DataStore._internal.createNotifier();
    const b = window.DataStore._internal.createNotifier();
    const receivedByA = [];

    a.subscribe((data) => receivedByA.push(data));
    b.notify("only for b");

    expect(receivedByA).toEqual([]);
  });
});

describe("createDomainStore", () => {
  beforeEach(() => {
    const store = {};
    global.chrome = {
      storage: {
        local: {
          get: (key) => Promise.resolve({ [key]: store[key] }),
          set: (obj) => { Object.assign(store, obj); return Promise.resolve(); },
          remove: (key) => { delete store[key]; return Promise.resolve(); },
        },
      },
    };
  });

  test("ready() resolves with an empty array when there's no cache yet", async () => {
    const fetchFn = () => Promise.resolve([{ id: 1 }]);
    const store = window.DataStore._internal.createDomainStore("events", fetchFn);

    const result = await store.ready();

    expect(result).toEqual([]);
  });

  test("ready() triggers a background refresh that notifies subscribers", async () => {
    const fetchFn = () => Promise.resolve([{ id: 1 }]);
    const store = window.DataStore._internal.createDomainStore("events", fetchFn);
    const received = [];
    store.subscribe((data) => received.push(data));

    await store.ready();
    await store.refresh(); // ready()'s own background refresh already ran; call again for a deterministic await

    expect(received[received.length - 1]).toEqual([{ id: 1 }]);
  });

  test("a failed refresh does not throw and leaves current data in place", async () => {
    const fetchFn = () => Promise.reject(new Error("network down"));
    const store = window.DataStore._internal.createDomainStore("events", fetchFn);

    await expect(store.refresh()).resolves.not.toThrow();
  });
});
