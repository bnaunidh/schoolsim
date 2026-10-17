# SchoolSim

A LAN multiplayer school game for up to **3 players**. Everybody else in the classroom is an NPC.

- **The first person to join picks** whether they are the **teacher** or a **student**.
- After that, other players can take the teacher spot if it's still free; otherwise they're students.
- If nobody is the teacher, an NPC teacher runs the class.
- NPC students fill every empty desk (12 desks in all). If a player leaves mid-game, an NPC takes over their character, and a late joiner takes over an NPC student.

A **3D** school game for up to **3 players**. Everybody else in the classroom is an NPC with their own personality.

## How to play

A match is **3 periods** of 2½ minutes each, with a short recess in between.

### Controls
| | |
|---|---|
| **Click** the game | Lock the mouse and look around (third-person). **Esc** frees the mouse to click menus. |
| `WASD` | Move |
| `V` | Switch between third-person and bird's-eye view |
| `T` | Talk: open the dialogue menu (number keys pick) |
| `M` | Sound on/off |

### NPC personalities
Every NPC kid has a **favourite subject** and one they **hate**. When the teacher changes the topic, fans cheer ("Yes! Math!") and haters groan ("Ugh, history… Zzz"). Kids raise their hands more and answer better in subjects they love, and act up more in ones they hate, so picking the topic matters. Ask a kid "What's your favourite subject?" to find out.

### Talking (press `T`)
Both roles have a **dialogue menu**. Press `T`, pick a type of dialogue, then pick a line (number keys or click). What you say pops up in a speech bubble, and every line does something. NPCs talk too.

| Teacher dialogue | What it does |
|---|---|
| 📚 **Topic** — "Today's topic is Math / Science / Geography / History / English!" | Starts a topic: it goes on the blackboard, and questions and quizzes come from it. You need a topic before you can teach or ask. |
| ❓ **Ask** — "Who can tell me the answer?" | Asks the class a question. Students raise their hands ✋. |
| ❓ **Ask** — "{name}, can you answer this?" | Calls on the selected kid (or **right-click**). Calling on someone who's goofing off catches them off guard. |
| 💬 **Chat** — "What's your favourite subject?", "How are you finding this lesson?", "Did you do your homework?", "Are you paying attention?", "Why are you out of your seat?" | Talk to the selected kid. They answer based on their personality and what they're up to. |
| ❓ **Ask** — "Yes, {name}? Your hand is up." | Calls on someone with their hand up. |
| ❓ **Ask** — "Pop quiz! Pencils out!" | The whole class answers (also `Q`). |
| 📢 **Discipline** — "Shhh!", "Eyes up here!", "Put that phone away!" | Settles the kids near you or the whole class, or takes a phone. |
| 📢 **Discipline** — "{name}! Detention!" / "Principal's office. NOW!" | Sends the kid you point at to detention (12 s) or the principal's office (25 s, out of the room). You can punish **anyone**, but if they weren't misbehaving the class protests and order drops. |
| 📢 **Discipline** — "{name}, you can go back to your seat." | Lets a kid out of detention early. |
| ⭐ **Praise** — "Great work, everyone!", "Gold star for {name}!", "Homework tonight!" | Raises order and grades. |

| Student dialogue | What it does |
|---|---|
| ✋ **Class** — raise hand (`H`), "I don't know…", "Why do we need to learn this?", "I love {topic}!", "{topic} is the WORST!" | Answer when called (`1`–`4`) for grade points. Classmates agree or argue with your opinions. |
| 🙋 **Requests** — bathroom / water / nurse | The teacher says yes or no (`Y`/`N`). A yes gives a 🎫 hall pass: 15 s to roam without trouble. |
| 😈 **Mischief** — "This is sooo boring!", whisper to a neighbour, fart noise, dance (`G`) | Mischief points, but the teacher can hear you. |
| 😇 **Nice** — compliment the teacher, offer to help | A few grade points. |

### Teacher
Keep the class under control.
- **Selecting a kid:** any kid within range appears in the **Kids in range** panel. Look at a kid, press **Tab** to cycle, or click a name. Lines with {name} go to the selected kid.
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

## Play in your browser (GitHub Pages)

**https://bnaunidh.github.io/schoolsim/**

1. One person clicks **Host a new class**. They get a 4-letter **class code** (and a link with the code in it).
2. Friends open the same page, type the code and click **Join**. It works on the same Wi-Fi and usually over the internet too.
3. The host is the first to join, so they choose teacher or student, then ring the bell.

The host's browser runs the whole class, so **the host should keep the game tab open and in front**. If the host leaves, the class ends.
Players connect directly to each other (WebRTC via [PeerJS](https://peerjs.com)); the public PeerJS server is only used to find each other.

Every push to `main` republishes the site automatically (`.github/workflows/static.yml` deploys the `public/` folder).

## Running your own LAN server (optional)

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
