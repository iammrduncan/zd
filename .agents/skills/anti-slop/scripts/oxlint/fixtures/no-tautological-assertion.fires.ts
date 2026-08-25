test("proves nothing", () => {
  expect(true).toBe(true);
  expect(user.name).toEqual(user.name);
  expect({}).toBeTruthy();
  assert.ok(true);
  assert.strictEqual(a.b, a.b);
});
