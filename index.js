import 'dotenv/config';
import express from 'express';
import {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
} from 'discord.js';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('Calendar Bot is alive!'));
app.listen(PORT, '0.0.0.0');

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const events = {};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
});

const commands = [
    new SlashCommandBuilder()
        .setName('calendar')
        .setDescription('予定調整カレンダーおよびヘルプを管理します')
        .addSubcommand(sub => sub.setName('help').setDescription('カレンダーBotの使い方を表示します'))
        .addSubcommand(sub => sub.setName('create').setDescription('新しい予定調整を作成します')
            .addStringOption(opt => opt.setName('title').setDescription('名前').setRequired(true))
            .addStringOption(opt => opt.setName('dates').setDescription('日程（カンマ区切り）').setRequired(true))
            .addIntegerOption(opt => opt.setName('target_count').setDescription('目標人数').setRequired(false)))
        .addSubcommand(sub => sub.setName('vote').setDescription('日程に◯/△/✕で回答します')
            .addStringOption(opt => opt.setName('event_id').setDescription('イベントID').setRequired(true))
            .addStringOption(opt => opt.setName('date').setDescription('日付').setRequired(true))
            .addStringOption(opt => opt.setName('choice').setDescription('回答').setRequired(true)
                .addChoices({ name: '◯', value: '◯' }, { name: '△', value: '△' }, { name: '✕', value: '✕' })))
        .addSubcommand(sub => sub.setName('batch_vote').setDescription('全日程に一括回答します')
            .addStringOption(opt => opt.setName('event_id').setDescription('イベントID').setRequired(true))
            .addStringOption(opt => opt.setName('choices').setDescription('回答（カンマ区切り）').setRequired(true)))
        .addSubcommand(sub => sub.setName('memo').setDescription('メモを残します')
            .addStringOption(opt => opt.setName('event_id').setDescription('イベントID').setRequired(true))
            .addStringOption(opt => opt.setName('text').setDescription('メモ内容').setRequired(true)))
        .addSubcommand(sub => sub.setName('edit_config').setDescription('設定を変更します')
            .addStringOption(opt => opt.setName('event_id').setDescription('イベントID').setRequired(true))
            .addStringOption(opt => opt.setName('title').setDescription('新しい名前').setRequired(false))
            .addIntegerOption(opt => opt.setName('target_count').setDescription('新しい目標人数').setRequired(false)))
];

const commandsJSON = commands.map(cmd => {
    const json = cmd.toJSON();
    json.integration_types = [0, 1];
    json.contexts = [0, 1, 2];
    return json;
});

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsJSON });
}

client.once('clientReady', async (c) => {
    console.log(`✅ カレンダーBot ログイン: ${c.user.tag}`);
    await registerCommands();
});

function getHelpContent() {
    return `📅 **カレンダーBotの使い方** 📅
• \`/calendar help\`: この使い方を表示
• \`/calendar create [名前] [日程] [目標人数]\`: カレンダー作成
• \`/calendar vote [ID] [日程] [◯/△/✕]\`: 個別投票
• \`/calendar batch_vote [ID] [◯,△,✕...]\`: 一括投票
• \`/calendar memo [ID] [メモ]\`: メモ追加
• \`/calendar edit_config [ID] [名前] [人数]\`: 設定変更`;
}

function buildEventUI(eventId) {
    const ev = events[eventId];
    if (!ev) return null;
    const embed = new EmbedBuilder().setTitle(`📅 予定調整: ${ev.title}`).setColor(0x3498db)
        .setDescription(`**ID**: \`${eventId}\` / **目標**: ${ev.targetCount ? ev.targetCount + '名' : '未設定'}`);
    let scheduleText = '';
    ev.dates.forEach(date => {
        let m = [], s = [], b = [];
        Object.values(ev.votes).forEach(v => {
            if (v.answers[date] === '◯') m.push(v.userName);
            if (v.answers[date] === '△') s.push(v.userName);
            if (v.answers[date] === '✕') b.push(v.userName);
        });
        scheduleText += `📌 **${date}**\n  ・◯(${m.length}): ${m.join(', ') || 'なし'}\n  ・△(${s.length}): ${s.join(', ') || 'なし'}\n  ・✕(${b.length}): ${b.join(', ') || 'なし'}\n\n`;
    });
    embed.addFields({ name: '📊 回答状況', value: scheduleText || 'なし' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`vote_modal_${eventId}`).setLabel('✏️ 回答').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`memo_modal_${eventId}`).setLabel('💬 メモ').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`config_modal_${eventId}`).setLabel('⚙️ 設定').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row] };
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'calendar') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'help') return interaction.reply({ content: getHelpContent(), ephemeral: true });
        if (sub === 'create') {
            const title = interaction.options.getString('title');
            const dates = interaction.options.getString('dates').split(',').map(d => d.trim());
            const targetCount = interaction.options.getInteger('target_count') || 0;
            const eventId = 'ev_' + Date.now().toString(36);
            events[eventId] = { id: eventId, title, targetCount, dates, votes: {} };
            return interaction.reply(buildEventUI(eventId));
        }
        // 他のサブコマンドも必要に応じて同様に処理
    }
    // ボタン・モーダル処理は前回のコードと同様に継続利用できます
});

client.login(TOKEN);