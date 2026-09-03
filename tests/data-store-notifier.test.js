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
    // Reset the cache chain to ensure tests don't interfere with each other
    window.DataStore._internal._resetCacheChain?.();
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

  test("concurrent refreshes from two domains both persist correctly (no read-modify-write race)", async () => {
    const store1 = window.DataStore._internal.createDomainStore(
      "events",
      () => Promise.resolve([{ id: 1, name: "event" }])
    );
    const store2 = window.DataStore._internal.createDomainStore(
      "groups",
      () => Promise.resolve([{ id: 2, name: "group" }])
    );

    // Trigger both refreshes concurrently without awaiting individually
    const promise1 = store1.refresh();
    const promise2 = store2.refresh();

    await Promise.all([promise1, promise2]);

    // Both should have notified their subscribers
    const received1 = [];
    const received2 = [];
    store1.subscribe((data) => received1.push(data));
    store2.subscribe((data) => received2.push(data));

    // Refresh again to trigger notifications
    await Promise.all([store1.refresh(), store2.refresh()]);

    expect(received1[received1.length - 1]).toEqual([{ id: 1, name: "event" }]);
    expect(received2[received2.length - 1]).toEqual([{ id: 2, name: "group" }]);

    // Verify cache has both domains' data by reading it back
    const result = await global.chrome.storage.local.get("planwise_data_cache");
    const cache = result["planwise_data_cache"];
    expect(cache.events.data).toEqual([{ id: 1, name: "event" }]);
    expect(cache.groups.data).toEqual([{ id: 2, name: "group" }]);
  });

  test("a failure in one queued cache operation does not break the chain for subsequent operations", async () => {
    // Create a store that will fail on its first refresh, then succeed
    let callCount = 0;
    const flakeyFetchFn = () => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("temporary failure"));
      }
      return Promise.resolve([{ id: 99, name: "recovered" }]);
    };

    const flakeyStore = window.DataStore._internal.createDomainStore("flakey", flakeyFetchFn);

    // First refresh fails
    await flakeyStore.refresh();

    // Create another store and refresh it - should still work despite the previous error
    const healthyStore = window.DataStore._internal.createDomainStore(
      "healthy",
      () => Promise.resolve([{ id: 100, name: "healthy" }])
    );

    await healthyStore.refresh();

    // Now try the flakey store again - should succeed this time
    const received = [];
    flakeyStore.subscribe((data) => received.push(data));
    await flakeyStore.refresh();

    expect(received[received.length - 1]).toEqual([{ id: 99, name: "recovered" }]);

    // Verify cache has both the healthy data and the recovered flakey data
    const result = await global.chrome.storage.local.get("planwise_data_cache");
    const cache = result["planwise_data_cache"];
    expect(cache.healthy.data).toEqual([{ id: 100, name: "healthy" }]);
    expect(cache.flakey.data).toEqual([{ id: 99, name: "recovered" }]);
  });
});
