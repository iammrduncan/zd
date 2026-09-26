# Served workbench objective

Date: 2026-08-31

## Owner intent

> Ok I want to plan a change here. Tauri is great, but its a bit limiting in terms of desktop
> etc... It's great for local development. But I really want to run everything remotely and just
> connect to it. I have two options... remote ssh connection and a server running on the box to
> handle protocol this is what zed and others do. Which works... but is complicated comms. If it is
> running slow is it the local app or the ssh connection or the process running on the remote
> host??? ... So I'm thinking a zd serve . that starts up a zd host in a free port at that location.
> then I can access zd through a browser... everything runs through zd backend instead of tauri...
> this works cause our app is already a typescript app... so I want you ot plan this out and spec out
> an easy simple goal in our docs to implement. Don't start implementation just do research and
> compile a way we can achieve this remote connection.

> This makes tauri app just run zd serve inside it too... simplifying tauri as just a literal
> wrapper... So we don't have two ways to read file systems, two ways to do terminal integrations,
> etc...
