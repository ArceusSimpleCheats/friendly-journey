const { Telegraf } = require('telegraf');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

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

bot.command('create', async (ctx) => {
    await ctx.reply('📸 Send me an image to create Hmonitor wall art');
    
    bot.on('photo', async (ctx) => {
        try {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileId = photo.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            
            await ctx.reply('🎨 Analysing pixels and generating 186x64 wall...');
            
            const response = await fetch(fileLink.href);
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            
            const wallData = await generateWallData(imageBuffer);
            const jsonString = JSON.stringify(wallData, null, 2);
            
            const outputFileName = `hmonitor_${Date.now()}.svn`;
            const tempPath = path.join(__dirname, outputFileName);
            await fs.writeFile(tempPath, jsonString, 'utf8');
            
            const monitorCount = MONITOR_COLS * MONITOR_ROWS;
            
            await ctx.replyWithDocument({
                source: tempPath,
                filename: outputFileName
            }, {
                caption: `✅ Hmonitor Wall Ready\n📐 186×64 px\n🖥️ ${monitorCount} monitors\n🎨 #RGB short hex format`
            });
            
            await fs.unlink(tempPath).catch(console.error);
            
            bot.off('photo');
            
        } catch (error) {
            console.error(error);
            await ctx.reply(`❌ Error: ${error.message}`);
            bot.off('photo');
        }
    });
});

bot.command('start', (ctx) => {
    ctx.reply('🎮 Hmonitor Bot\n\n/create - Create monitor art by analysing pixels\nSend any image and get 186x64 wall file');
});

bot.launch();
console.log('✅ Hmonitor Telegram bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
