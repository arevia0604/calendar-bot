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
    ChannelType,
} from 'discord.js';

// ==========================================
// 1. Webサーバーの設定（RenderのPing受け取り用）
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

// GASやUptimeRobotなどの外部からアクセスが来たときの処理
app.get('/', (req, res) => {
    console.log('🏓 Pingを受信しました！サーバーは稼働中です。');
    res.status(200).send('I am alive!');
});

// ポートを開いてサーバーを起動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server is running on port ${PORT}`);
});

// ==========================================
// 2. TOKENのデバッグ・環境変数確認
// ==========================================
console.log("=== TOKEN デバッグ開始 ===");
console.log("型:", typeof process.env.TOKEN);
console.log("中身が存在するか:", process.env.TOKEN ? "存在する（長さ: " + process.env.TOKEN.length + "文字）" : "❌ 存在しない（undefined または 空）");
console.log("=== TOKEN デバッグ終了 ===");

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ==========================================
// 3. Discord Botの初期化
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const tempChannels = new Set();

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
});

const calendars = {};

function createCalendarEmbed(calendarName) {
    const cal = calendars[calendarName];
    if (!cal) return null;

    const summaryByDate = {};

    for (const [userId, dates] of Object.entries(cal.schedules)) {
        for (const [date, info] of Object.entries(dates)) {
            if (!summaryByDate[date]) {
                summaryByDate[date] = { '〇': 0, '△': 0, '✕': 0 };
            }
            if (summaryByDate[date][info.status] !== undefined) {
                summaryByDate[date][info.status]++;
            }
        }
    }

    let description = `👥 **定員**: ${cal.maxMembers}人\n\n`;

    description += '📊 **【日付ごとの集計】**\n';
    const sortedDates = Object.keys(summaryByDate).sort();
    if (sortedDates.length === 0) {
        description += '（まだ集計データはありません）\n\n';
    } else {
        for (const date of sortedDates) {
            const counts = summaryByDate[date];
            description += `・**${date}** ➔ 〇: ${counts['〇']}人 / △: ${counts['△']}人 / ✕: ${counts['✕']}人\n`;
        }
        description += '\n';
    }

    description += '👤 **【メンバー別の個別予定】**\n';
    const entries = Object.entries(cal.schedules);
    if (entries.length === 0) {
        description += '（まだ誰も予定を入力していません）\n';
    } else {
        for (const [userId, dates] of entries) {
            description += `・<@${userId}>\n`;
            for (const [date, info] of Object.entries(dates)) {
                const memoStr = info.memo ? ` （メモ: ${info.memo}）` : '';
                description += ` └ **${date}**: ${info.status}${memoStr}\n`;
            }
        }
    }

    return new EmbedBuilder()
        .setTitle(`🗓️ 調整カレンダー [ ${calendarName} ]`)
        .setColor(0x3498DB)
        .setDescription(description)
        .setFooter({ text: `最終更新: ${new Date().toLocaleString('ja-JP')}` });
}

function createCalendarButtons(calendarName) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cal_${calendarName}_maru`)
            .setLabel('〇 参加')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`cal_${calendarName}_sankaku`)
            .setLabel('△ 微妙')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`cal_${calendarName}_batsu`)
            .setLabel('✕ 欠席')
            .setStyle(ButtonStyle.Danger)
    );
}

async function updateCalendarMessage(client, calendarName) {
    const cal = calendars[calendarName];
    if (!cal || !cal.channelId || !cal.messageId) return;

    try {
        const channel = await client.channels.fetch(cal.channelId);
        const message = await channel.messages.fetch(cal.messageId);

        const embed = createCalendarEmbed(calendarName);
        const buttons = createCalendarButtons(calendarName);

        await message.edit({ embeds: [embed], components: [buttons] });
    } catch (error) {
        console.log('カレンダーの更新に失敗しました:', error);
    }
}

client.once('ready', () => {
    console.log(`[カレンダーBot] ${client.user.tag} としてログインしました！`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(' ');
    const command = args[0];

    if (command === '!create') {
        const name = args[1];
        const maxMembers = parseInt(args[2]);

        if (!name || isNaN(maxMembers)) {
            return message.reply('書き方が違うよ！ 例: `!create 飲み会 5`');
        }

        if (calendars[name]) {
            return message.reply(`カレンダー「${name}」はすでに存在します！`);
        }

        calendars[name] = {
            maxMembers: maxMembers,
            channelId: message.channel.id,
            messageId: null,
            schedules: {}
        };

        const embed = createCalendarEmbed(name);
        const buttons = createCalendarButtons(name);
        const sentMessage = await message.channel.send({ embeds: [embed], components: [buttons] });

        calendars[name].messageId = sentMessage.id;
        await message.reply(`カレンダー「${name}」（定員: ${maxMembers}人）を作成しました！`);
    }
    else if (command === '!members') {
        const name = args[1];
        const newMax = parseInt(args[2]);

        if (!name || isNaN(newMax) || !calendars[name]) {
            return message.reply('書き方が違うよ！ 例: `!members 飲み会 6`');
        }

        calendars[name].maxMembers = newMax;
        await message.reply(`カレンダー「${name}」の定員を ${newMax}人に変更しました！`);
        await updateCalendarMessage(client, name);
    }
    else if (command === '!set') {
        const name = args[1];
        const date = args[2];
        const status = args[3];
        const memo = args.slice(4).join(' ');

        if (!name || !date || !['〇', '△', '✕'].includes(status) || !calendars[name]) {
            return message.reply('書き方が違うよ！ 例: `!set 飲み会 2026-05-01 〇 遅れます`');
        }

        const userId = message.author.id;
        if (!calendars[name].schedules[userId]) {
            calendars[name].schedules[userId] = {};
        }

        calendars[name].schedules[userId][date] = { status, memo };

        await message.reply(`📅 ${date} の予定を「${status}」で登録しました！（メモ: ${memo || 'なし'}）`);
        await updateCalendarMessage(client, name);
    }
    else if (command === '!batch-set') {
        const name = args[1];
        const entries = args.slice(2);

        if (!name || entries.length === 0 || !calendars[name]) {
            return message.reply('書き方が違うよ！ 例: `!batch-set 飲み会 2026-05-01:〇:遅れます 2026-05-02:✕:不参加`');
        }

        const userId = message.author.id;
        if (!calendars[name].schedules[userId]) {
            calendars[name].schedules[userId] = {};
        }

        let count = 0;
        let errorOccurred = false;

        for (const entry of entries) {
            const parts = entry.split(':');
            const date = parts[0];
            const status = parts[1];
            const memo = parts.slice(2).join(':') || '';

            if (date && ['〇', '△', '✕'].includes(status)) {
                calendars[name].schedules[userId][date] = { status, memo };
                count++;
            } else {
                errorOccurred = true;
            }
        }

        let replyText = `📅 カレンダー「${name}」に ${count}件の予定をまとめて登録しました！`;
        if (errorOccurred) {
            replyText += '\n⚠️ 一部フォーマットが正しくない項目があったためスキップされました';
        }

        await message.reply(replyText);
        await updateCalendarMessage(client, name);
    }
    // カレンダーBotのヘルプ: /cal help
    else if (message.content.trim() === '/cal help') {
        await message.reply(
            '**🤖 予定調整カレンダーBotの使い方**\n' +
            '・`!create [名前] [人数]` : カレンダーを作成する（例: `!create 飲み会 5`）\n' +
            '・`!members [名前] [人数]` : 定員を変更する\n' +
            '・`!set [名前] [日付] [〇/△/✕] [メモ]` : 1日分の予定を個別に登録する\n' +
            '・`!batch-set [名前] [日付:状態:メモ] ...` : 複数日をまとめて一括登録する\n' +
            '・*(ボタン操作)* : カレンダー下のボタンで本日の予定をすばやく登録（集計も自動更新）\n' +
            '・`/cal help` : このヘルプを表示する'
        );
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith('cal_')) return;

    const parts = customId.split('_');
    const action = parts.pop();
    parts.shift();
    const calendarName = parts.join('_');

    const userId = interaction.user.id;
    const todayStr = new Date().toISOString().split('T')[0];

    let status = '〇';
    if (action === 'sankaku') status = '△';
    if (action === 'batsu') status = '✕';

    if (!calendars[calendarName]) {
        return interaction.reply({ content: 'このカレンダーは見つかりませんでした。', ephemeral: true });
    }

    if (!calendars[calendarName].schedules[userId]) {
        calendars[calendarName].schedules[userId] = {};
    }

    calendars[calendarName].schedules[userId][todayStr] = { status, memo: 'ボタンから登録' };

    await interaction.reply({ content: `本日の予定（${todayStr}）を「${status}」に更新しました！`, ephemeral: true });
    await updateCalendarMessage(client, calendarName);
});

client.login(process.env.DISCORD_TOKEN);