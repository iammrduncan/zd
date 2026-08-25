test("proves something", () => {
  expect(add(2, 2)).toBe(4);
  expect(user.name).toEqual("ada");
  expect(list).toBeTruthy();
  assert.ok(isReady());
  assert.strictEqual(a.b, c.d);
});
