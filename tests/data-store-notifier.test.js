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
