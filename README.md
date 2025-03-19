# 🎮 Discord VC Audit & 5v5 Team Generator Bot

A Discord bot that:
- Logs voice channel join/leave/switch events in a server-defined text channel.
- Generates random 5v5 teams interactively with button-based participation!

---

## 🚀 Features

✅ **VC Audit**  
- Tracks user join/leave/switch events in voice channels.  
- Sends logs to a configurable text channel using `/setvcchannel`.

✅ **5v5 Team Generator**  
- Interactive team generator with button-based participation.  
- Randomizes participants and fills empty slots if fewer than 10 users join.  
- Displays two teams after the countdown.

---

## 🛠️ Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YourUsername/YourRepo.git
   cd YourRepo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a `.env` file to store your secrets:**
   ```
   TOKEN=your-bot-token
   CLIENT_ID=your-client-id
   ```

4. **Create `vcChannels.json` in the root directory (optional at start):**
   ```json
   {}
   ```

5. **Run the bot:**
   ```bash
   node index.js
   ```

---

## ⚙️ Commands

### `/setvcchannel`
Sets the current channel to receive voice state logs (join/leave/switch).  
**Permission Required:** Administrator

### `/teamgen`
Starts a 30-second window where users can join. After 30 seconds, random 5v5 teams are created and displayed.

---

## 📂 File Structure

```
index.js           # Main bot logic
vcChannels.json    # Stores guild-specific VC audit log channel settings
.env               # Secrets (TOKEN and CLIENT_ID)
package.json       # Project metadata and dependencies
```

---

## ✅ Permissions Required
- `Read Messages/View Channels`
- `Send Messages`
- `Manage Channels` (Optional, if you want automated channel creation in future updates)
- `View Voice State`

---

## 📝 License

This project is licensed under the MIT License.

---

## 💡 Future Improvements
- Auto-create temporary VC channels
- Voice activity-based features (e.g., mute/kick inactive users)
- Custom team sizes and names
