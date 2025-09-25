require('dotenv').config(); // Load .env variables

const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

let vcChannels = {};
let activityLog = {};
let presenceLog = {};
let autoDeleteChannels = {};

// Load and validate JSON files
try { vcChannels = require('./vcChannels.json'); } catch {}
try { activityLog = require('./activityLog.json'); } catch {}
try {
    const loaded = require('./presenceLog.json');
    if (typeof loaded === 'object' && loaded !== null) {
        for (const [userId, entries] of Object.entries(loaded)) {
            if (!Array.isArray(entries) || !entries.every(e => e && typeof e.status === 'string' && typeof e.time === 'number')) {
                throw new Error("Invalid format");
            }
        }
        presenceLog = loaded;
    } else {
        throw new Error("Not an object");
    }
} catch {
    presenceLog = {};
    fs.writeFileSync('./presenceLog.json', JSON.stringify(presenceLog, null, 2));
}
try { autoDeleteChannels = require('./autoDeleteChannels.json'); } catch {}

// Save helpers
function saveVCChannels() {
    fs.writeFileSync('./vcChannels.json', JSON.stringify(vcChannels, null, 2));
}
function saveActivityLog() {
    fs.writeFileSync('./activityLog.json', JSON.stringify(activityLog, null, 2));
}
function savePresenceLog() {
    fs.writeFileSync('./presenceLog.json', JSON.stringify(presenceLog, null, 2));
}
function saveAutoDeleteChannels() {
    fs.writeFileSync('./autoDeleteChannels.json', JSON.stringify(autoDeleteChannels, null, 2));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

const commands = [
    new SlashCommandBuilder()
        .setName('setvcchannel')
        .setDescription('Set this channel for VC join/leave logs'),
    new SlashCommandBuilder()
        .setName('teamgen')
        .setDescription('Start a 5v5 team generator!'),
    new SlashCommandBuilder()
        .setName('trackactivity')
        .setDescription('Check if user was online in VC or presence last 24 hours')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('setautodeletechannel')
        .setDescription('Set this channel for daily auto-delete at 12 AM'),
    new SlashCommandBuilder()
        .setName('clearchats')
        .setDescription('Manually clear chats in the configured auto-delete channel'),
    new SlashCommandBuilder()
        .setName('disableautodelete')
        .setDescription('Disable auto-delete for this server'),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Slash commands registered!');
    } catch (error) {
        console.error(error);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    registerCommands();
    scheduleDailyClear();
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // ---- VC Log Setup ----
    if (commandName === 'setvcchannel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Admin permission required.', ephemeral: true });
        }
        vcChannels[interaction.guild.id] = interaction.channel.id;
        saveVCChannels();
        return interaction.reply('✅ VC log channel set!');
    }

    // ---- Team Generator ----
    if (commandName === 'teamgen') {
        const participants = [];
        const joinButton = new ButtonBuilder().setCustomId('join_team').setLabel('Join').setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);

        const message = await interaction.reply({ content: 'Click to join 5v5! **30 seconds** left.', components: [row], fetchReply: true });
        const collector = message.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', i => {
            if (!participants.find(p => p.id === i.user.id)) {
                participants.push({ id: i.user.id, name: i.user.username });
                i.reply({ content: '✅ Joined!', ephemeral: true });
            } else {
                i.reply({ content: '⚠️ Already joined!', ephemeral: true });
            }
        });

        collector.on('end', async () => {
            if (participants.length === 0) {
                return interaction.editReply({ content: '❌ No participants.', components: [] });
            }

            const required = 10;
            const fillers = Array.from({ length: required - participants.length }, (_, i) => ({
                id: null,
                name: `Player ${participants.length + i + 1}`,
            }));
            const all = [...participants, ...fillers];
            shuffleArray(all);
            const teamA = all.slice(0, 5);
            const teamB = all.slice(5, 10);

            interaction.editReply({
                content: `🎮 **Team Generator** 🎮\n\n**Team A:**\n${teamA.map(p => p.name).join('\n')}\n\n**Team B:**\n${teamB.map(p => p.name).join('\n')}`,
                components: [],
            });
        });
    }

    // ---- Activity Tracker ----
    if (commandName === 'trackactivity') {
        const user = interaction.options.getUser('user');
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        const vcTimes = (activityLog[user.id] || []).filter(t => t > oneDayAgo);

        const logs = (presenceLog[user.id] || []).filter((entry, i, arr) => {
            if (entry.time <= oneDayAgo) return false;
            const prev = arr[i - 1];
            return !prev || prev.status !== entry.status;
        });

        const MAX_LENGTH = 1900;
        const username = user.username;

        let vcMessage = `🗣️ **VC Join Times:** ${vcTimes.length > 0 ? vcTimes.map(t => `<t:${Math.floor(t / 1000)}:t>`).join(', ') : '❌ None'}`;
        let presenceHeader = `🟢 **Presence Changes:**\n`;
        let presenceChunks = [];

        let currentChunk = '';
        for (let line of logs.map(entry => `- **${entry.status.toUpperCase()}** at <t:${Math.floor(entry.time / 1000)}:f>`)) {
            if ((currentChunk + line + '\n').length > MAX_LENGTH) {
                presenceChunks.push(currentChunk);
                currentChunk = '';
            }
            currentChunk += line + '\n';
        }
        if (currentChunk) presenceChunks.push(currentChunk);
        if (presenceChunks.length === 0) presenceChunks.push('❌ No status changes in last 24h');

        await interaction.reply({
            content: `📊 **${username}'s Activity (Last 24h):**\n\n${vcMessage}\n\n${presenceHeader}${presenceChunks[0]}`
        });

        for (let i = 1; i < presenceChunks.length; i++) {
            await interaction.followUp({ content: presenceChunks[i] });
        }
    }

    // ---- Auto Delete Setup ----
    if (commandName === 'setautodeletechannel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Admin permission required.', ephemeral: true });
        }
        autoDeleteChannels[interaction.guild.id] = interaction.channel.id;
        saveAutoDeleteChannels();
        return interaction.reply('✅ This channel is now set for daily auto-delete at 12 AM!');
    }

    if (commandName === 'clearchats') {
        const channelId = autoDeleteChannels[interaction.guild.id];
        if (!channelId) return interaction.reply('❌ No auto-delete channel set for this server.');

        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return interaction.reply('❌ Configured channel is invalid.');

        try {
            await interaction.deferReply({ ephemeral: true });
            await clearChannel(channel);
            await interaction.editReply(`🧹 Cleared messages in ${channel.name}`);
        } catch (err) {
            console.error(err);
            if (interaction.deferred) {
                await interaction.editReply('❌ Failed to clear messages. Check bot permissions.');
            } else {
                await interaction.reply({ content: '❌ Failed to clear messages.', ephemeral: true });
            }
        }
    }

    if (commandName === 'disableautodelete') {
        if (!autoDeleteChannels[interaction.guild.id]) {
            return interaction.reply('❌ Auto-delete was not enabled for this server.');
        }
        delete autoDeleteChannels[interaction.guild.id];
        saveAutoDeleteChannels();
        return interaction.reply('✅ Auto-delete disabled for this server.');
    }
});

// ---- Voice State Logs ----
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    const wasIn = !!oldState.channel;
    const isIn = !!newState.channel;

    if (!wasIn && isIn) {
        if (!activityLog[member.id]) activityLog[member.id] = [];
        activityLog[member.id].push(Date.now());
        saveActivityLog();
    }

    const logChannel = client.channels.cache.get(vcChannels[newState.guild.id]);
    if (!logChannel) return;

    if (!wasIn && isIn) {
        logChannel.send(`✅ **${member.user.username}** joined **${newState.channel.name}**`);
    } else if (wasIn && !isIn) {
        logChannel.send(`❌ **${member.user.username}** left **${oldState.channel.name}**`);
    } else if (oldState.channelId !== newState.channelId) {
        logChannel.send(`🔄 **${member.user.username}** moved from **${oldState.channel.name}** to **${newState.channel.name}**`);
    }
});

// ---- Presence Logs ----
client.on('presenceUpdate', (oldPresence, newPresence) => {
    if (!newPresence || !newPresence.userId) return;
    const userId = newPresence.userId;
    const status = newPresence.status;

    if (!['online', 'idle', 'dnd', 'offline'].includes(status)) return;

    if (!presenceLog[userId]) presenceLog[userId] = [];

    const last = presenceLog[userId][presenceLog[userId].length - 1];
    if (!last || last.status !== status) {
        presenceLog[userId].push({ status, time: Date.now() });

        if (presenceLog[userId].length > 100) {
            presenceLog[userId] = presenceLog[userId].slice(-100);
        }

        savePresenceLog();
    }
});

// ---- Helpers ----
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function clearChannel(channel) {
    let fetched;
    let cycles = 0;
    do {
        fetched = await channel.messages.fetch({ limit: 100 });
        if (fetched.size === 0) break;
        await channel.bulkDelete(fetched, true).catch(() => {});
        cycles++;
        if (cycles > 50) break; // safety stop
    } while (fetched.size >= 2);
}

function scheduleDailyClear() {
    const now = new Date();
    const millisTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0) - now;

    setTimeout(async () => {
        for (const [guildId, channelId] of Object.entries(autoDeleteChannels)) {
            try {
                const guild = await client.guilds.fetch(guildId);
                const channel = await guild.channels.fetch(channelId);
                if (!channel || !channel.isTextBased()) continue;
                await clearChannel(channel);
                console.log(`🧹 Cleared messages in ${channel.name} (${guild.name})`);
            } catch (err) {
                console.error(`Failed clearing messages for guild ${guildId}:`, err);
            }
        }
        scheduleDailyClear(); // reschedule next midnight
    }, millisTillMidnight);
}

client.login(TOKEN);
