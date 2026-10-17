# Detention!

A LAN multiplayer school game for up to **3 players**. Everybody else in the classroom is an NPC.

- **The first person to join picks** whether they are the **teacher** or a **student**.
- After that, other players can take the teacher spot if it's still free; otherwise they're students.
- If nobody is the teacher, an NPC teacher runs the class.
- NPC students fill every empty desk (12 desks in all). If a player leaves mid-game, an NPC takes over their character, and a late joiner takes over an NPC student.

## How to play

A match is **3 periods** of 2½ minutes each, with a short recess in between.

**Teacher** — keep the class under control.
- `WASD` move, mouse to look. Your **yellow vision cone** is visible to everyone.
- `Space` / click: catch a misbehaving student inside your cone → 12 s detention. Accusing the wrong kid costs class order.
- `E` at the blackboard: teach. The class learns faster and order goes up, **but you face the board** and can't see anyone.
- `Q`: pop quiz (every 35 s).
- You win a period if **Class order** is at least 50 when the bell rings.

**Student** — earn the most points without getting caught.
- `WASD` move, `E` to sit back down at your desk.
- Hold `F`: play on your phone (+mischief).
- `N`: pass a note to the nearest classmate.
- Click: throw a paper ball (hitting the teacher is worth a lot!).
- Leaving your seat also counts as misbehaving.
- `1`–`4`: answer pop quizzes for grade points.
- Sitting quietly earns grade points, even more while the teacher is teaching.
- Students win a period if class order drops below 50, or instantly if it hits 0 (**CHAOS!**).

## Running it on your LAN

You need [Node.js](https://nodejs.org) 18 or newer on **one** computer (the host).

```sh
npm install
npm start
```

Or double-click `start.bat` (Windows) / run `./start.sh` (Mac/Linux).

The server prints addresses like:

```
On this computer:   http://localhost:3000
Friends on your LAN: http://192.168.1.23:3000
```

Everyone opens that LAN address in a browser on the same Wi-Fi/network. If friends can't connect, allow Node.js through the host computer's firewall.

Set `PORT=4000` to use a different port.
