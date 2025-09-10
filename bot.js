require('dotenv').config(); 
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");
const Database = require("better-sqlite3");

// === CONFIG ===
const TOKEN = process.env.TOKEN; 
const PREFIX = "!";
const GUILD_ID = "1255647172066545675";

// === Discord Client ===
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

// === Banco de dados ===
const db = new Database("db.sqlite");
db.prepare(`
    CREATE TABLE IF NOT EXISTS usuarios (
        discordId TEXT PRIMARY KEY,
        gcProfile TEXT,
        level INTEGER
    )
`).run();

// === Função: pegar level do perfil GC ===
async function pegarLevelGC(profileUrl) {
    try {
        const { data } = await axios.get(profileUrl);
        const $ = cheerio.load(data);

        const level = $(".badge-level").first().text().trim();
        return parseInt(level) || null;
    } catch (err) {
        console.error("Erro ao buscar perfil:", err.message);
        return null;
    }
}

// === Função: atualizar cargo no Discord ===
async function atualizarCargo(member, levelNovo, levelAntigo = null) {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const roles = guild.roles.cache;

        if (levelAntigo) {
            const roleAntigo = roles.find(r => r.name === `Level ${levelAntigo}`);
            if (roleAntigo) await member.roles.remove(roleAntigo).catch(() => {});
        }

        const roleNovo = roles.find(r => r.name === `Level ${levelNovo}`);
        if (roleNovo) {
            await member.roles.add(roleNovo);
            console.log(`🎯 ${member.user.tag} atualizado para Level ${levelNovo}`);
        }
    } catch (err) {
        console.error("Erro ao atualizar cargo:", err.message);
    }
}

// === Bot pronto ===
client.once("ready", () => {
    console.log(`✅ Logado como ${client.user.tag}`);
});

// === Comandos ===
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).split(" ");
    const command = args.shift().toLowerCase();

    // Vincular perfil GC
    if (command === "vincular") {
        const profileUrl = args[0];
        if (!profileUrl) return message.reply("❌ Envie o link do seu perfil GC.");

        const level = await pegarLevelGC(profileUrl);
        if (!level) return message.reply("❌ Não consegui encontrar o level nesse perfil.");

        db.prepare("INSERT OR REPLACE INTO usuarios (discordId, gcProfile, level) VALUES (?, ?, ?)").run(
            message.author.id,
            profileUrl,
            level
        );

        message.reply(`✅ Perfil vinculado! Level detectado: **${level}**`);
        await atualizarCargo(message.member, level);
    }

    // Atualizar levels de todos os usuários
    if (command === "atualizar") {
        const guild = await client.guilds.fetch(GUILD_ID);
        const rows = db.prepare("SELECT * FROM usuarios").all();

        message.reply("🔄 Atualizando levels de todos os usuários...");

        for (const user of rows) {
            const levelAtual = await pegarLevelGC(user.gcProfile);
            if (!levelAtual) continue;

            if (levelAtual !== user.level) {
                const member = await guild.members.fetch(user.discordId).catch(() => null);
                if (!member) continue;

                await atualizarCargo(member, levelAtual, user.level);
                db.prepare("UPDATE usuarios SET level = ? WHERE discordId = ?").run(levelAtual, user.discordId);
            }
        }

        message.reply("✅ Levels atualizados!");
    }

    // Ver seu próprio level
    if (command === "meulevel") {
        const row = db.prepare("SELECT * FROM usuarios WHERE discordId = ?").get(message.author.id);
        if (!row) return message.reply("❌ Você ainda não vinculou seu perfil GC.");

        const level = await pegarLevelGC(row.gcProfile);
        if (!level) return message.reply("❌ Não consegui pegar seu level agora.");
        message.reply(`🎮 Seu level atual é: **${level}**`);
    }
});

// === Iniciar bot ===
client.login(TOKEN);
