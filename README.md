# Detention!

A LAN multiplayer school game for up to **3 players**. Everybody else in the classroom is an NPC.

- **The first person to join picks** whether they are the **teacher** or a **student**.
- After that, other players can take the teacher spot if it's still free; otherwise they're students.
- If nobody is the teacher, an NPC teacher runs the class.
- NPC students fill every empty desk (12 desks in all). If a player leaves mid-game, an NPC takes over their character, and a late joiner takes over an NPC student.

## How to play

A match is **3 periods** of 2½ minutes each, with a short recess in between.

### Talking (press `T`)
Both roles have a **dialogue menu**. Press `T`, pick a type of dialogue, then pick a line (number keys or click). What you say pops up in a speech bubble, and every line does something. NPCs talk too.

| Teacher dialogue | What it does |
|---|---|
| 📚 **Topic** — "Today's topic is Math / Science / Geography / History / English!" | Starts a topic: it goes on the blackboard, and questions and quizzes come from it. You need a topic before you can teach or ask. |
| ❓ **Ask** — "Who can tell me the answer?" | Asks the class a question. Students raise their hands ✋. |
| ❓ **Ask** — "{name}, can you answer this?" | Calls on the student you're pointing at (or **right-click** them). Calling on someone who's goofing off catches them off guard. |
| ❓ **Ask** — "Yes, {name}? Your hand is up." | Calls on someone with their hand up. |
| ❓ **Ask** — "Pop quiz! Pencils out!" | The whole class answers (also `Q`). |
| 📢 **Discipline** — "Shhh!", "Eyes up here!", "Put that phone away!", "Detention!" | Settles the kids near you or the whole class, takes a phone, or gives detention. |
| ⭐ **Praise** — "Great work, everyone!", "Gold star for {name}!", "Homework tonight!" | Raises order and grades. |

| Student dialogue | What it does |
|---|---|
| ✋ **Class** — raise hand (`H`), "I don't know…", "Why do we need to learn this?" | Answer when called (`1`–`4`) for grade points. |
| 🙋 **Requests** — bathroom / water / nurse | The teacher says yes or no (`Y`/`N`). A yes gives a 🎫 hall pass: 15 s to roam without trouble. |
| 😈 **Mischief** — "This is sooo boring!", whisper to a neighbour, fart noise | Mischief points, but the teacher can hear you. |
| 😇 **Nice** — compliment the teacher, offer to help | A few grade points. |

### Teacher
Keep the class under control.
- `WASD` move, mouse to look. Your **yellow vision cone** is visible to everyone.
- `Space` / click: catch a misbehaving student inside your cone → 12 s detention. Accusing the wrong kid costs class order.
- `E` at the blackboard: teach (needs a topic). The class learns faster and order goes up, **but you face the board** and can't see anyone.
- You win a period if **Class order** is at least 50 when the bell rings.

### Student
Earn the most points without getting caught.
- `WASD` move, `E` to sit back down at your desk.
- Hold `F`: play on your phone. `N`: pass a note. Click: throw a paper ball (hitting the teacher is worth a lot!).
- Leaving your seat without a hall pass also counts as misbehaving.
- Sitting quietly and answering questions earns grade points.
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
