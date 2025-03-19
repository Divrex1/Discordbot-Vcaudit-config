const { Client, GatewayIntentBits, Events, REST, Routes, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

// ✅ BOT TOKEN & CLIENT ID (replace with your actual credentials)
const TOKEN = 'your token';
const CLIENT_ID = 'your client id';

// ✅ Load vcChannels.json (where per-server channels are stored)
let vcChannels = {};
try {
    vcChannels = require('./vcChannels.json');
} catch (error) {
    console.log('vcChannels.json not found. Will create a new one when saving.');
}

// ✅ Save vcChannels.json when updated
function saveVCChannels() {
    fs.writeFileSync('./vcChannels.json', JSON.stringify(vcChannels, null, 2));
}

// ✅ Create the bot client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
    ],
});

// ✅ Slash Command Registration (register both commands)
const commands = [
    new SlashCommandBuilder()
        .setName('setvcchannel')
        .setDescription('Set the channel where VC join/leave messages will appear.'),
    new SlashCommandBuilder()
        .setName('teamgen')
        .setDescription('Start a 5v5 team generator!'),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('Slash commands registered!');
    } catch (error) {
        console.error(error);
    }
}

// ✅ When the bot is ready
client.once(Events.ClientReady, () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    registerCommands();
});

// ✅ Slash Command Handler
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Handle /setvcchannel command
    if (interaction.commandName === 'setvcchannel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: '❌ You need **Administrator** permission to use this command.', ephemeral: true });
            return;
        }

        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;

        vcChannels[guildId] = channelId;
        saveVCChannels();

        await interaction.reply(`✅ This channel has been set for VC join/leave messages!`);
    }

    // Handle /teamgen command
    if (interaction.commandName === 'teamgen') {
        const participants = [];

        const joinButton = new ButtonBuilder()
            .setCustomId('join_team')
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(joinButton);

        const message = await interaction.reply({
            content: 'Click the button below to join the 5v5 team generator!\nYou have **30 seconds** to join.',
            components: [row],
            fetchReply: true,
        });

        const collector = message.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', i => {
            if (!participants.find(p => p.id === i.user.id)) {
                participants.push({ id: i.user.id, name: i.user.username });
                i.reply({ content: `✅ You joined the team generator!`, ephemeral: true });
            } else {
                i.reply({ content: `⚠️ You already joined!`, ephemeral: true });
            }
        });

        collector.on('end', async () => {
            if (participants.length === 0) {
                interaction.editReply({ content: '❌ No participants joined. Cancelled.', components: [] });
                return;
            }

            const requiredPlayers = 10;
            const fillerNames = [];
            let fillersNeeded = requiredPlayers - participants.length;

            for (let i = 1; i <= fillersNeeded; i++) {
                fillerNames.push({ id: null, name: `Player ${participants.length + i}` });
            }

            const allPlayers = [...participants, ...fillerNames];
            shuffleArray(allPlayers);

            const teamA = allPlayers.slice(0, 5);
            const teamB = allPlayers.slice(5, 10);

            const teamAMembers = teamA.map(p => p.name).join('\n');
            const teamBMembers = teamB.map(p => p.name).join('\n');

            interaction.editReply({
                content: `🎮 **Team Generator Results** 🎮\n\n` +
                    `**Team A:**\n${teamAMembers}\n\n` +
                    `**Team B:**\n${teamBMembers}`,
                components: [],
            });
        });
    }
});

// ✅ Voice Channel Event Handler
client.on('voiceStateUpdate', (oldState, newState) => {
    const guildId = newState.guild.id;
    const logChannelId = vcChannels[guildId];

    if (!logChannelId) return;

    const logChannel = client.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const member = newState.member;

    if (!oldState.channel && newState.channel) {
        logChannel.send(`✅ **${member.user.username}** joined **${newState.channel.name}**`);
    } else if (oldState.channel && !newState.channel) {
        logChannel.send(`❌ **${member.user.username}** left **${oldState.channel.name}**`);
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        logChannel.send(`🔄 **${member.user.username}** switched from **${oldState.channel.name}** to **${newState.channel.name}**`);
    }
});

// ✅ Utility Function: Shuffle
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// ✅ Login the bot
client.login(TOKEN);
