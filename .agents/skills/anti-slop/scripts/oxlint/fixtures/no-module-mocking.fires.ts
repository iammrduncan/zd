vi.mock("./client", () => ({ fetchUser: vi.fn() }));
jest.mock("./mailer");
vi.doMock("./clock", () => ({ now: () => 0 }));
