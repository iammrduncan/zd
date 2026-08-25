const client = { fetchUser: () => stubUser };
const mailer = new FakeMailer();
const clock = { now: () => 0 };
