const { Telegraf } = require('telegraf');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');

const BOT_TOKEN = '8890712007:AAGUuVP8HtmRaSBtrMdkyJ6TUCYE5DIiwLk';

const MONITOR_COLS = 31;
const MONITOR_ROWS = 32;
const BLOCKS_PER_MONITOR_X = 6;
const BLOCKS_PER_MONITOR_Y = 2;
const TOTAL_PIXEL_WIDTH = MONITOR_COLS * BLOCKS_PER_MONITOR_X;
const TOTAL_PIXEL_HEIGHT = MONITOR_ROWS * BLOCKS_PER_MONITOR_Y;

const SPACING_X = 1.73;
const SPACING_Y = 1.06;
const BASE_Y_OFFSET = 0.53146565;
const POS_Z = 15.0;
const UNIQUE_ID_BASE = 225282455;

const LANGUAGES = {
    en: {
        start: 'Hypper Sandbox - Monitor Wall Art Creator\n/build - Create wall art from image\n/lang - Change language',
        build: 'Send me an image to create monitor wall art',
        analyzing: 'Analyzing pixels and generating 186x64 wall...',
        ready: 'Hypper Wall Ready\n186x64 px\n{count} monitors\nRGB short hex format',
        error: 'Error: {msg}',
        lang_prompt: 'Select language:',
        lang_set: 'Language set to English',
        invalid: 'Invalid. Send /lang again'
    },
    zh: {
        start: 'Hypper沙盒 - 显示器墙艺术创作器\n/build - 从图像创建墙艺术\n/lang - 更改语言',
        build: '发送一张图片来创建显示器墙艺术',
        analyzing: '正在分析像素并生成186x64墙...',
        ready: 'Hypper墙就绪\n186x64像素\n{count}个显示器\nRGB短十六进制格式',
        error: '错误: {msg}',
        lang_prompt: '选择语言:',
        lang_set: '语言设置为中文',
        invalid: '无效。再次发送 /lang'
    },
    ru: {
        start: 'Hypper Sandbox - Создатель настенного искусства монитора\n/build - Создать настенное искусство из изображения\n/lang - Сменить язык',
        build: 'Отправьте изображение для создания настенного искусства монитора',
        analyzing: 'Анализ пикселей и генерация стены 186x64...',
        ready: 'Стена Hypper готова\n186x64 пикселей\n{count} мониторов\nКороткий формат RGB hex',
        error: 'Ошибка: {msg}',
        lang_prompt: 'Выберите язык:',
        lang_set: 'Язык установлен на русский',
        invalid: 'Недействительно. Отправьте /lang снова'
    },
    es: {
        start: 'Hypper Sandbox - Creador de arte mural de monitores\n/build - Crear arte mural desde imagen\n/lang - Cambiar idioma',
        build: 'Envía una imagen para crear arte mural de monitor',
        analyzing: 'Analizando píxeles y generando pared 186x64...',
        ready: 'Pared Hypper lista\n186x64 px\n{count} monitores\nFormato RGB hex corto',
        error: 'Error: {msg}',
        lang_prompt: 'Selecciona idioma:',
        lang_set: 'Idioma cambiado a español',
        invalid: 'Inválido. Envía /lang nuevamente'
    },
    fr: {
        start: 'Hypper Sandbox - Créateur d\'art mural pour moniteur\n/build - Créer une œuvre murale à partir d\'une image\n/lang - Changer la langue',
        build: 'Envoie une image pour créer une œuvre murale de moniteur',
        analyzing: 'Analyse des pixels et génération du mur 186x64...',
        ready: 'Mur Hypper prêt\n186x64 px\n{count} moniteurs\nFormat hex RGB court',
        error: 'Erreur: {msg}',
        lang_prompt: 'Choisis la langue:',
        lang_set: 'Langue changée en français',
        invalid: 'Invalide. Envoie /lang à nouveau'
    },
    de: {
        start: 'Hypper Sandbox - Monitor Wandkunst Ersteller\n/build - Wandkunst aus Bild erstellen\n/lang - Sprache ändern',
        build: 'Sende ein Bild, um Monitor-Wandkunst zu erstellen',
        analyzing: 'Analysiere Pixel und generiere 186x64 Wand...',
        ready: 'Hypper Wand bereit\n186x64 px\n{count} Monitore\nKurzes RGB Hex Format',
        error: 'Fehler: {msg}',
        lang_prompt: 'Sprache wählen:',
        lang_set: 'Sprache auf Deutsch gesetzt',
        invalid: 'Ungültig. Sende /lang erneut'
    }
};

const userLang = new Map();

function getText(userId, key, replace = {}) {
    const lang = userLang.get(userId) || 'en';
    let text = LANGUAGES[lang][key] || LANGUAGES.en[key];
    for (const [k, v] of Object.entries(replace)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}

function toShortHexComponent(value) {
    return Math.round(value / 17).toString(16);
}

function getShortHex(r, g, b) {
    const rShort = toShortHexComponent(r);
    const gShort = toShortHexComponent(g);
    const bShort = toShortHexComponent(b);
    return `${rShort}${gShort}${bShort}`.toUpperCase();
}

function buildRichLine(colorsShortArray) {
    let lineHtml = '<b>';
    for (let i = 0; i < BLOCKS_PER_MONITOR_X; i++) {
        lineHtml += `<color=#${colorsShortArray[i]}>█</color>`;
    }
    lineHtml += '</b>';
    return lineHtml;
}

function buildMonitorRichText(line1ShortHex, line2ShortHex) {
    const line1 = buildRichLine(line1ShortHex);
    const line2 = buildRichLine(line2ShortHex);
    return `<size=136%>${line1}\n${line2}</size>`;
}

async function generateWallData(imageBuffer) {
    const resizedBuffer = await sharp(imageBuffer)
        .resize(TOTAL_PIXEL_WIDTH, TOTAL_PIXEL_HEIGHT, {
            fit: 'fill',
            kernel: 'nearest'
        })
        .raw()
        .toBuffer();
    
    const pixels = new Uint8Array(resizedBuffer);
    const props = [];
    
    for (let row = 0; row < MONITOR_ROWS; row++) {
        for (let col = 0; col < MONITOR_COLS; col++) {
            const tileOriginX = col * BLOCKS_PER_MONITOR_X;
            const tileOriginY = row * BLOCKS_PER_MONITOR_Y;
            
            const lineColorsShort = [[], []];
            
            for (let localY = 0; localY < BLOCKS_PER_MONITOR_Y; localY++) {
                const absoluteY = tileOriginY + localY;
                for (let localX = 0; localX < BLOCKS_PER_MONITOR_X; localX++) {
                    const absoluteX = tileOriginX + localX;
                    const pixelIndex = (absoluteY * TOTAL_PIXEL_WIDTH + absoluteX) * 3;
                    const r = pixels[pixelIndex];
                    const g = pixels[pixelIndex + 1];
                    const b = pixels[pixelIndex + 2];
                    const shortHex = getShortHex(r, g, b);
                    lineColorsShort[localY].push(shortHex);
                }
            }
            
            const richTextContent = buildMonitorRichText(lineColorsShort[0], lineColorsShort[1]);
            
            const posX = (col - (MONITOR_COLS / 2)) * SPACING_X;
            const posY = BASE_Y_OFFSET + ((MONITOR_ROWS - 1 - row) * SPACING_Y);
            const uniqueId = UNIQUE_ID_BASE + (row * MONITOR_COLS + col);
            const firstBlockColor = `#${lineColorsShort[0][0]}`;
            
            const monitorProp = {
                "name": "Monitor",
                "uniqueId": uniqueId,
                "position": {
                    "x": parseFloat(posX.toFixed(5)),
                    "y": parseFloat(posY.toFixed(5)),
                    "z": POS_Z
                },
                "rotation": {
                    "x": 0.0,
                    "y": 1.0,
                    "z": 0.0,
                    "w": -4.20811475E-08
                },
                "isKinematic": true,
                "instantiationData": null,
                "runtimeData": {
                    "connectedIds": [],
                    "Text": richTextContent,
                    "Color": firstBlockColor
                }
            };
            props.push(monitorProp);
        }
    }
    
    return {
        "map": "FlatGrass",
        "props": props
    };
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Hypper Monitor Wall Bot is running');
});

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

bot.start((ctx) => {
    const userId = ctx.from.id;
    userLang.set(userId, 'en');
    ctx.reply(getText(userId, 'start'));
});

bot.command('lang', (ctx) => {
    const userId = ctx.from.id;
    ctx.reply(getText(userId, 'lang_prompt'), {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'English', callback_data: 'lang_en' }],
                [{ text: '中文', callback_data: 'lang_zh' }],
                [{ text: 'Русский', callback_data: 'lang_ru' }],
                [{ text: 'Español', callback_data: 'lang_es' }],
                [{ text: 'Français', callback_data: 'lang_fr' }],
                [{ text: 'Deutsch', callback_data: 'lang_de' }]
            ]
        }
    });
});

bot.action(/lang_(.+)/, (ctx) => {
    const userId = ctx.from.id;
    const langCode = ctx.match[1];
    userLang.set(userId, langCode);
    ctx.answerCbQuery();
    ctx.reply(getText(userId, 'lang_set'));
});

let waitingForImage = new Map();

bot.command('build', async (ctx) => {
    const userId = ctx.from.id;
    waitingForImage.set(userId, true);
    await ctx.reply(getText(userId, 'build'));
});

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    if (!waitingForImage.get(userId)) return;
    
    try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileId = photo.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        await ctx.reply(getText(userId, 'analyzing'));
        
        const response = await fetch(fileLink.href);
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        
        const wallData = await generateWallData(imageBuffer);
        const jsonString = JSON.stringify(wallData, null, 2);
        
        const outputFileName = `hypper_${Date.now()}.svn`;
        const tempPath = path.join(__dirname, outputFileName);
        await fs.writeFile(tempPath, jsonString, 'utf8');
        
        const monitorCount = MONITOR_COLS * MONITOR_ROWS;
        
        await ctx.replyWithDocument({
            source: tempPath,
            filename: outputFileName
        }, {
            caption: getText(userId, 'ready', { count: monitorCount })
        });
        
        await fs.unlink(tempPath).catch(console.error);
        waitingForImage.delete(userId);
        
    } catch (error) {
        console.error(error);
        await ctx.reply(getText(userId, 'error', { msg: error.message }));
        waitingForImage.delete(userId);
    }
});

bot.launch();
console.log('Hypper bot running - /start /build /lang');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
