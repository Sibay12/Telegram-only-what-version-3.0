const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- 4-BOT ARCHITECTURE CONFIGURATION ---
const ADMIN_BOT_TOKEN = '8787715855:AAF9PLZkk_tOb28TYcyTcAs_NszwURnzhkw'; // Super Admin Bot
const SUPPORT_BOT_TOKEN = '8736759061:AAGaSKOCQ9gUylCsqdAufHenEPeDQhQtSDU'; // Support Bot

const CUSTOMER_BOT_CONFIGS = [
    { id: 'bot1', token: '8874503246:AAEmdPcVJMQ3q6pmINsP_Tcwium3ANV4T6I' },
    { id: 'bot2', token: '8972064227:AAG3LadKR0mLXJgU3xL6BwMy7TxjYz8N3Rw' }
];

const DEFAULT_ADMIN_CHAT_ID = '7659178694';
const SUPPORT_BOT_USERNAME = 'JPW_SUPPORT_ADMIN_BOT';
const PORT = process.env.PORT || 3000;
const MONGO_URI = 'mongodb+srv://sibadityapal47_db_user:G95Dds7IGyBQNmGh@cluster0.yjvazin.mongodb.net/jpw_bot?retryWrites=true&w=majority';

// --- PACKAGES CONFIGURATION ---
const RECHARGE_PACKAGES = [
    { amount: 15, reaches: 1 },
    { amount: 45, reaches: 6 },
    { amount: 95, reaches: 7 },
    { amount: 195, reaches: 15 },
    { amount: 395, reaches: 33 },
    { amount: 795, reaches: 70 },
    { amount: 995, reaches: 99 }
];

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 MongoDB Cloud Connected Successfully!"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    firstName: { type: String, default: 'User' },
    reaches: { type: Number, default: 0 },
    planName: { type: String, default: 'No Plan Purchased' },
    expiryDate: { type: Date, default: null },
    lastActiveBotToken: { type: String, default: '' },
    pendingUtrAmount: { type: Number, default: null }
});

const orderSchema = new mongoose.Schema({
    custChatId: String,
    targetId: String,
    targetPass: String,
    status: { type: String, default: 'Pending' },
    adminMsgId: { type: Number, default: null },
    botTokenUsed: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', userSchema);
const OrderModel = mongoose.model('Order', orderSchema);

const adminBot = new TelegramBot(ADMIN_BOT_TOKEN, { polling: true });
const supportBot = new TelegramBot(SUPPORT_BOT_TOKEN, { polling: true });

let adminState = {}; 

async function initUser(chatId, firstName = 'User', botToken = '') {
    let user = await UserModel.findOne({ chatId: String(chatId) });
    if (!user) {
        user = new UserModel({ 
            chatId: String(chatId), 
            firstName: firstName || 'User', 
            reaches: 0, 
            lastActiveBotToken: botToken 
        });
        await user.save();
    } else if (botToken && user.lastActiveBotToken !== botToken) {
        user.lastActiveBotToken = botToken;
        await user.save();
    }
    return user;
}

function formatExpiryDate(dateObj) {
    if (!dateObj) return 'N/A (No active plan)';
    const d = new Date(dateObj);
    return d.toISOString().split('T')[0];
}

async function sendToUserViaSpecificBot(token, chatId, text, options = {}) {
    if (!token) return;
    try {
        const tempBot = new TelegramBot(token);
        return await tempBot.sendMessage(chatId, text, options);
    } catch (e) {
        console.error(`Failed to send via specific bot token:`, e.message);
    }
}

// -------------------------------------------------------------
// 🎧 SUPPORT BOT ENGINE
// -------------------------------------------------------------
supportBot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    if (chatId === DEFAULT_ADMIN_CHAT_ID) return;
    const firstName = msg.from ? msg.from.first_name : 'User';

    supportBot.sendMessage(chatId, `🎧 **JPW OFFICIAL SUPPORT CENTER**\n\nHello **${firstName}**! Please send your issue or question here. This message will be sent directly to the support team.`, {
        parse_mode: 'Markdown'
    });
});

supportBot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    if (chatId === DEFAULT_ADMIN_CHAT_ID) {
        if (adminState['SUPPORT_REPLY_TARGET']) {
            const targetUserId = adminState['SUPPORT_REPLY_TARGET'];
            adminState['SUPPORT_REPLY_TARGET'] = null;

            try {
                await supportBot.sendMessage(targetUserId, `👨‍💻 **SUPPORT TEAM REPLY:**\n\n${text}`, { parse_mode: 'Markdown' });
                return supportBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✅ **Support reply sent successfully to the user via Support Bot!**`, { parse_mode: 'Markdown' });
            } catch (e) {
                return supportBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `❌ **Failed to send support reply:** ${e.message}`, { parse_mode: 'Markdown' });
            }
        }
        return;
    }

    const userObj = msg.from || {};
    const fullName = `${userObj.first_name || 'User'} ${userObj.last_name || ''}`.trim();
    const username = userObj.username ? `@${userObj.username}` : 'No Username';

    const alertText = `
📩 **NEW SUPPORT TICKET (VIA SUPPORT BOT)**

👤 **User:** ${fullName} (${username})
🆔 **Chat ID:** \`${chatId}\`
💬 **Message:**
"${text}"
    `.trim();

    await supportBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, alertText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '💬 Reply to User', callback_data: `sup_reply_${chatId}` }]]
        }
    });

    return supportBot.sendMessage(chatId, `✅ **Your message has been sent to the support team!**`, { parse_mode: 'Markdown' });
});

supportBot.on('callback_query', async (query) => {
    const data = query.data;
    if (data.startsWith('sup_reply_')) {
        const targetUserId = data.replace('sup_reply_', '');
        adminState['SUPPORT_REPLY_TARGET'] = targetUserId;
        supportBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✍️ **Type your reply for Support User \`${targetUserId}\` directly in this chat:**`, { parse_mode: 'Markdown' });
        supportBot.answerCallbackQuery(query.id);
    }
});

// -------------------------------------------------------------
// ⏰ TIME-BASED AUTOMATED BROADCAST
// -------------------------------------------------------------
function startEngagementScheduler() {
    setInterval(async () => {
        const now = new Date();
        const currentHour = now.getUTCHours() + 5.5; 
        const hour = Math.floor(currentHour) % 24;
        const mins = now.getUTCMinutes();

        const isTimeValid = (hour > 7 || (hour === 7 && mins >= 0)) && (hour < 21 || (hour === 21 && mins <= 30));

        if (isTimeValid && mins % 30 === 0) {
            try {
                const users = await UserModel.find();
                const messages = [
                    "☀️ Good Morning! Are your services running smoothly? Stay connected with JPW Enterprise.",
                    "🚀 Update: Our servers are operating at full speed. Submit your orders now!",
                    "💡 Tip: Maintain enough reaches in your wallet for instant order processing.",
                    "🌙 Evening Greetings! Do you need any assistance? Feel free to contact support."
                ];
                const randomMsg = messages[Math.floor(Math.random() * messages.length)];

                for (let u of users) {
                    if (u.lastActiveBotToken) {
                        sendToUserViaSpecificBot(u.lastActiveBotToken, u.chatId, `🤖 **JPW AUTO NOTIFICATION**\n\n${randomMsg}`, { parse_mode: 'Markdown' });
                    }
                }
            } catch (e) {}
        }

        if (mins === 0) {
            try {
                const lowUsers = await UserModel.find({ reaches: { $lte: 1 } });
                for (let u of lowUsers) {
                    if (u.lastActiveBotToken) {
                        sendToUserViaSpecificBot(u.lastActiveBotToken, u.chatId, `⚠️ **LOW BALANCE ALERT!**\n\nYou only have **${u.reaches} Reach** left in your account. Please recharge immediately to avoid order interruptions.`, { parse_mode: 'Markdown' });
                    }
                }
            } catch (e) {}
        }
    }, 60 * 1000);
}

startEngagementScheduler();

// -------------------------------------------------------------
// 🤖 MULTI CUSTOMER BOTS ENGINE
// -------------------------------------------------------------
CUSTOMER_BOT_CONFIGS.forEach(botConfig => {
    const cBot = new TelegramBot(botConfig.token, { polling: true });

    cBot.onText(/\/start/, async (msg) => {
        const chatId = String(msg.chat.id);
        const firstName = msg.from ? msg.from.first_name : 'Customer';
        let user = await initUser(chatId, firstName, botConfig.token);

        const expiryStr = formatExpiryDate(user.expiryDate);
        const planNameStr = user.reaches > 0 ? 'Starter+' : 'No Active Plan';

        await cBot.sendMessage(chatId, `Hello!\n\nYou can contact bot administrators using this bot.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '💬 Support', url: `https://t.me/${SUPPORT_BOT_USERNAME}` }]]
            }
        });

        const serviceText = `
✨ **𝗝𝗣𝗪 𝗥𝗲𝗮𝗰𝗵 𝗦𝗲𝗿𝘃𝗶𝗰𝗲** ⚡

📌 **𝗕𝗲𝗳𝗼𝗿𝗲 𝗦𝗲𝗻𝗱𝗶𝗻𝗴 𝗜𝗗 & 𝗣𝗮𝘀𝘀:**
• ✅ Begin Journey mein Workorder assign hona chahiye.
• 🗺️ Map open hona chahiye.
• 🔑 Agar ID/Password expire ho gaya hai, pehle update karein, phir bot ko bhejein.

📩 **𝗘𝗸 𝗵𝗶 𝗺𝗲𝘀𝘀𝗮𝗴𝗲 𝗺𝗲 𝗯𝗵𝗲𝗷𝗲𝗶𝗻:**

TECHID PASSWORD

Example:
06181921 Pass@123#

⏳ Bot jitna wait time de, utna wait karein. Is dauran JPW login na karein.

✅ Reach complete hone ke baad hi login karein.

🔒 Safe • Secure • Fast • Trusted — Unknown logon se reach karwana avoid karein taaki account aur workorder safe rahe.

📦 **Your Subscription:**
• Plan: ${planNameStr}
• 📡 Remaining: ${user.reaches} reaches
• ⏱️ Expires: ${expiryStr}
        `.trim();

        await cBot.sendMessage(chatId, serviceText, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '💳 Recharge Wallet' }, { text: '💰 View Balance' }],
                    [{ text: '💬 Support' }]
                ],
                resize_keyboard: true
            }
        });
    });

    cBot.onText(/\/buy/, async (msg) => {
        const chatId = String(msg.chat.id);
        await initUser(chatId, msg.from ? msg.from.first_name : 'Customer', botConfig.token);

        let pkgText = `🏷️ **SELECT A RECHARGE PACKAGE:**\n\nPlease click on any package below to get the dynamic QR code:`;
        let inlineKeyboard = [];

        RECHARGE_PACKAGES.forEach(pkg => {
            inlineKeyboard.push([{
                text: `🔥 ₹${pkg.amount} ➡️ ${pkg.reaches} Reach`,
                callback_data: `buy_pkg_${pkg.amount}_${pkg.reaches}`
            }]);
        });

        return cBot.sendMessage(chatId, pkgText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
    });

    cBot.onText(/\/yourplan/, async (msg) => {
        const chatId = String(msg.chat.id);
        let user = await initUser(chatId, msg.from ? msg.from.first_name : 'Customer', botConfig.token);

        const expiryStr = formatExpiryDate(user.expiryDate);
        const planNameStr = user.reaches > 0 ? 'Starter+' : 'No Active Plan';

        const planText = `
📦 **YOUR SUBSCRIPTION PLAN:**
• Plan: ${planNameStr}
• 📡 Remaining: ${user.reaches} reaches
• ⏱️ Expires: ${expiryStr}
        `.trim();

        return cBot.sendMessage(chatId, planText, { parse_mode: 'Markdown' });
    });

    // PHOTO LISTENER
    cBot.on('photo', async (msg) => {
        const chatId = String(msg.chat.id);
        let user = await initUser(chatId, msg.from ? msg.from.first_name : 'User', botConfig.token);

        const photoArray = msg.photo;
        const fileId = photoArray[photoArray.length - 1].file_id;
        const captionText = msg.caption || 'No caption';

        let adminInlineKeyboard = RECHARGE_PACKAGES.map(pkg => [{
            text: `✅ Approve +${pkg.reaches} Reaches (₹${pkg.amount})`,
            callback_data: `appr_${botConfig.token}_${chatId}_${pkg.reaches}`
        }]);
        adminInlineKeyboard.push([{ text: `❌ Reject Screenshot`, callback_data: `rej_${botConfig.token}_${chatId}` }]);

        try {
            await adminBot.sendPhoto(DEFAULT_ADMIN_CHAT_ID, fileId, {
                caption: `💳 **NEW PAYMENT SCREENSHOT RECEIVED**\n\n🤖 Bot Source: \`${botConfig.id}\`\n👤 Customer: ${user.firstName} (\`${chatId}\`)\n💰 Remaining Wallet: \`${user.reaches} Reaches\`\n💬 Caption: "${captionText}"`,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: adminInlineKeyboard }
            });

            return cBot.sendMessage(chatId, `✅ **Payment Screenshot Successfully Submitted!**\nThe QR card has been removed. Reaches and validity will be updated once verified by the admin.`, {
                parse_mode: 'Markdown',
                reply_markup: { remove_keyboard: true }
            });
        } catch (err) {
            try {
                await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `💳 **NEW PAYMENT SCREENSHOT SUBMISSION**\n\n🤖 Bot Source: \`${botConfig.id}\`\n👤 Customer: ${user.firstName} (\`${chatId}\`)\n⚠️ [Auto Remark: Photo caption formatting error]`, { parse_mode: 'Markdown' });
                await adminBot.sendPhoto(DEFAULT_ADMIN_CHAT_ID, fileId);
                return cBot.sendMessage(chatId, `✅ **Payment Screenshot Successfully Submitted!**`, { reply_markup: { remove_keyboard: true } });
            } catch (innerErr) {
                return cBot.sendMessage(chatId, `❌ **Auto Error Remark:** Failed to process screenshot. Please try sending again.`);
            }
        }
    });

    // TEXT MESSAGE LISTENER
    cBot.on('message', async (msg) => {
        const chatId = String(msg.chat.id);
        const text = msg.text;
        if (!text || text.startsWith('/')) return;

        let user = await initUser(chatId, msg.from ? msg.from.first_name : 'User', botConfig.token);

        if (text === '💬 Support') {
            return cBot.sendMessage(chatId, `🎧 **JPW OFFICIAL SUPPORT CENTER**\n\nFor any issues or assistance, please click our official support bot below:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '💬 Open Support Bot', url: `https://t.me/${SUPPORT_BOT_USERNAME}` }]]
                }
            });
        }

        if (text === '💳 Recharge Wallet') {
            let pkgText = `🏷️ **SELECT A RECHARGE PACKAGE:**\n\nPlease click on any package below to get the dynamic QR code:`;
            let inlineKeyboard = [];

            RECHARGE_PACKAGES.forEach(pkg => {
                inlineKeyboard.push([{
                    text: `🔥 ₹${pkg.amount} ➡️ ${pkg.reaches} Reach`,
                    callback_data: `buy_pkg_${pkg.amount}_${pkg.reaches}`
                }]);
            });

            return cBot.sendMessage(chatId, pkgText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        }

        if (text === '💰 View Balance') {
            return cBot.sendMessage(chatId, `💰 **Wallet Balance:** \`${user.reaches} Reaches\``, { parse_mode: 'Markdown' });
        }

        // 1. CHECK FOR ORDER FORMAT: 10-digit ID + Password (6 to 10 characters)
        const orderMatch = text.trim().match(/^(\d{10})\s+(\S{6,10})$/);
        if (orderMatch) {
            const targetId = orderMatch[1];
            const targetPass = orderMatch[2];

            const activeOrRecentOrder = await OrderModel.findOne({
                targetId: targetId,
                $or: [
                    { status: { $in: ['Pending', 'Processing'] } },
                    { status: 'Completed', completedAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) } }
                ]
            });

            if (activeOrRecentOrder) {
                if (activeOrRecentOrder.status !== 'Completed') {
                    return cBot.sendMessage(chatId, `❌ **Auto Error Remark:** Target ID \`${targetId}\` is already active or in process. No reaches deducted.`, { parse_mode: 'Markdown' });
                } else {
                    const timePassedSec = Math.floor((Date.now() - new Date(activeOrRecentOrder.completedAt).getTime()) / 1000);
                    const timeLeftSec = 120 - timePassedSec;
                    const minsLeft = Math.floor(timeLeftSec / 60);
                    const secsLeft = timeLeftSec % 60;

                    return cBot.sendMessage(chatId, `⏳ **Auto Error Remark (Cooldown):** Target ID \`${targetId}\` was completed recently. Please wait **${minsLeft}m ${secsLeft}s**. No reaches deducted.`, { parse_mode: 'Markdown' });
                }
            }

            if (user.reaches < 1) {
                return cBot.sendMessage(chatId, `❌ **Auto Error Remark:** Insufficient balance! Minimum 1 Reach required. Please recharge.`, { parse_mode: 'Markdown' });
            }

            user.reaches -= 1;
            await user.save();

            const newOrder = await OrderModel.create({ 
                custChatId: chatId, 
                targetId, 
                targetPass, 
                botTokenUsed: botConfig.token 
            });

            const adminMsg = await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `⚡ **NEW ORDER RECEIVED**\n\n🤖 Bot Source: \`${botConfig.id}\`\n👤 Customer: \`${chatId}\`\n💰 Remaining Wallet: \`${user.reaches} Reaches\`\n🎯 Target ID: \`${targetId}\`\n🔑 Password: \`${targetPass}\``, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🟢 Accept (In Process)', callback_data: `acc_ord_${newOrder._id}` },
                            { text: '🔴 Reject & Refund', callback_data: `rej_ord_${newOrder._id}` }
                        ]
                    ]
                }
            });

            newOrder.adminMsgId = adminMsg.message_id;
            await newOrder.save();

            return cBot.sendMessage(chatId, `✅ **Your order has been successfully processed & submitted!**\n🎯 Target ID: \`${targetId}\`\n💰 1 Reach Deducted. Current Balance: ${user.reaches} Reaches.`, { parse_mode: 'Markdown' });
        }

        // Check invalid password length attempt
        const potentialOrderMatch = text.trim().match(/^(\d{10})\s+(.+)$/);
        if (potentialOrderMatch) {
            return cBot.sendMessage(chatId, `❌ **Auto Error Remark:** Password must be between **6 to 10 characters** long.\nExample: \`06181921 Pass@123\``, { parse_mode: 'Markdown' });
        }

        // 2. ABSOLUTE UNRESTRICTED FALLBACK (Anything else sent goes directly to admin)
        const submittedText = text.trim();
        user.pendingUtrAmount = null;
        await user.save();

        let adminInlineKeyboard = RECHARGE_PACKAGES.map(pkg => [{
            text: `✅ Approve +${pkg.reaches} Reaches (₹${pkg.amount})`,
            callback_data: `appr_${botConfig.token}_${chatId}_${pkg.reaches}`
        }]);
        adminInlineKeyboard.push([{ text: `❌ Reject Submission`, callback_data: `rej_${botConfig.token}_${chatId}` }]);

        await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `💳 **NEW PAYMENT / SUBMISSION RECEIVED**\n\n🤖 Bot Source: \`${botConfig.id}\`\n👤 Customer: ${user.firstName} (\`${chatId}\`)\n💰 Remaining Wallet: \`${user.reaches} Reaches\`\n💬 Content Sent:\n"${submittedText}"`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: adminInlineKeyboard }
        });

        return cBot.sendMessage(chatId, `✅ **Your submission has been sent to the admin successfully!**\nThe QR card has been removed. Reaches and validity will be updated once verified.`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    });

    cBot.on('callback_query', async (query) => {
        const data = query.data;
        const chatId = String(query.message.chat.id);

        if (data.startsWith('buy_pkg_')) {
            const parts = data.split('_');
            const amount = parts[2];
            const reaches = parts[3];
            const upiId = 'paytm.s2ujlw0@pty';

            const upiLink = `upi://pay?pa=${upiId}&pn=JPWPay&am=${amount}&cu=INR`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;

            try { await cBot.deleteMessage(chatId, query.message.message_id); } catch (e) {}

            await cBot.sendPhoto(chatId, qrUrl, {
                caption: `💳 **DYNAMIC QR CODE (₹${amount})**\n📦 Package: ${reaches} Reaches\n🆔 UPI: \`${upiId}\`\n\n👇 After making payment, send your **Payment Screenshot (Image)** or any text/number in this chat!`,
                parse_mode: 'Markdown'
            });
            cBot.answerCallbackQuery(query.id);
        }
    });
});

// -------------------------------------------------------------
// 👑 SUPER ADMIN BOT WORKFLOW
// -------------------------------------------------------------
adminBot.on('callback_query', async (query) => {
    const data = query.data;
    const msgId = query.message.message_id;

    if (data.startsWith('appr_')) {
        const parts = data.split('_');
        const tokenUsed = parts[1];
        const targetChatId = parts[2];
        const reachesToAdd = parseInt(parts[3]);

        let user = await UserModel.findOne({ chatId: targetChatId });
        if (user) {
            user.reaches += reachesToAdd;
            user.planName = 'Starter+';
            
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);
            user.expiryDate = expiryDate;

            await user.save();

            const expiryStr = formatExpiryDate(expiryDate);

            try { await adminBot.deleteMessage(DEFAULT_ADMIN_CHAT_ID, msgId); } catch (e) {}

            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✅ **APPROVED!** Added +${reachesToAdd} Reaches to \`${targetChatId}\`. Valid till ${expiryStr}`, { parse_mode: 'Markdown' });

            sendToUserViaSpecificBot(tokenUsed, targetChatId, `🎉 **RECHARGE APPROVED!**\n**+${reachesToAdd} Reaches** added.\n⏱️ Your plan is now active and expires on: **${expiryStr}**`, { parse_mode: 'Markdown' });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Recharge Approved & Card Removed!" });
    }
    else if (data.startsWith('rej_')) {
        const parts = data.split('_');
        const tokenUsed = parts[1];
        const targetChatId = parts[2];

        try { await adminBot.deleteMessage(DEFAULT_ADMIN_CHAT_ID, msgId); } catch (e) {}

        adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `❌ **SUBMISSION REJECTED & REMOVED!**`, { parse_mode: 'Markdown' });

        sendToUserViaSpecificBot(tokenUsed, targetChatId, `❌ **Auto Error Remark:** Your payment proof was found invalid. Please contact support if needed.`, { parse_mode: 'Markdown' });
        adminBot.answerCallbackQuery(query.id, { text: "Submission Rejected!" });
    }
    else if (data.startsWith('acc_ord_')) {
        const orderId = data.replace('acc_ord_', '');
        const order = await OrderModel.findById(orderId);

        if (order) {
            order.status = 'Processing';
            await order.save();

            adminState[DEFAULT_ADMIN_CHAT_ID] = { step: 'WAIT_FEEDBACK_TEXT', orderId };
            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✍️ **Set to In-Process!**\nNow type and send the feedback/text you want to send to the customer:`, { parse_mode: 'Markdown' });

            adminBot.editMessageReplyMarkup({
                inline_keyboard: [[
                    { text: '✅ Complete Order', callback_data: `comp_ord_${orderId}` },
                    { text: '❌ Cancel & Refund', callback_data: `canc_ord_${orderId}` }
                ]]
            }, { chat_id: DEFAULT_ADMIN_CHAT_ID, message_id: msgId });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Marked In-Process!" });
    }
    else if (data.startsWith('comp_ord_')) {
        const orderId = data.replace('comp_ord_', '');
        const order = await OrderModel.findById(orderId);

        if (order) {
            order.status = 'Completed';
            order.completedAt = new Date();
            await order.save();

            try { await adminBot.deleteMessage(DEFAULT_ADMIN_CHAT_ID, msgId); } catch (e) {}

            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `🎉 **Order Completed & Removed Successfully for Target ID: ${order.targetId}**`, { parse_mode: 'Markdown' });

            sendToUserViaSpecificBot(order.botTokenUsed, order.custChatId, `🎉 **YOUR ORDER HAS BEEN COMPLETED SUCCESSFULLY!**\nTarget ID: \`${order.targetId}\``, { parse_mode: 'Markdown' });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Order Completed & Removed!" });
    }
    else if (data.startsWith('rej_ord_') || data.startsWith('canc_ord_')) {
        const orderId = data.replace('rej_ord_', '').replace('canc_ord_', '');
        const order = await OrderModel.findById(orderId);

        if (order && order.status !== 'Refunded') {
            order.status = 'Refunded';
            await order.save();

            let user = await UserModel.findOne({ chatId: order.custChatId });
            if (user) {
                user.reaches += 1;
                await user.save();
            }

            try { await adminBot.deleteMessage(DEFAULT_ADMIN_CHAT_ID, msgId); } catch (e) {}

            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `❌ **Order Cancelled, Refunded & Removed!**`, { parse_mode: 'Markdown' });

            sendToUserViaSpecificBot(order.botTokenUsed, order.custChatId, `❌ **Auto Error Remark:** Your order was cancelled! Your 1 Reach has been refunded back to your wallet.`, { parse_mode: 'Markdown' });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Order Cancelled & Removed!" });
    }
});

adminBot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    if (chatId !== DEFAULT_ADMIN_CHAT_ID) return;

    const text = msg.text;
    if (!text) return;

    if (adminState[DEFAULT_ADMIN_CHAT_ID]?.step === 'WAIT_FEEDBACK_TEXT') {
        const orderId = adminState[DEFAULT_ADMIN_CHAT_ID].orderId;
        adminState[DEFAULT_ADMIN_CHAT_ID] = null;
        const feedbackText = text;

        const order = await OrderModel.findById(orderId);
        if (order) {
            sendToUserViaSpecificBot(order.botTokenUsed, order.custChatId, `ℹ️ **ADMIN UPDATE / FEEDBACK:**\n\n${feedbackText}`, { parse_mode: 'Markdown' });
            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✅ **Feedback/Text sent successfully to the customer via their active bot!**`, { parse_mode: 'Markdown' });
        }
        return;
    }

    if (adminState[DEFAULT_ADMIN_CHAT_ID]?.step === 'WAIT_ANNOUNCEMENT_TEXT') {
        adminState[DEFAULT_ADMIN_CHAT_ID] = null;
        const announceText = text;

        adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `⏳ **Broadcasting announcement to all registered customers...**`, { parse_mode: 'Markdown' });

        try {
            const users = await UserModel.find();
            let successCount = 0;

            for (let u of users) {
                if (u.lastActiveBotToken) {
                    await sendToUserViaSpecificBot(u.lastActiveBotToken, u.chatId, `📢 **ANNOUNCEMENT / OFFER**\n\n${announceText}`, { parse_mode: 'Markdown' });
                    successCount++;
                }
            }

            return adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✅ **Announcement successfully sent to ${successCount} users!**`, { parse_mode: 'Markdown' });
        } catch (e) {
            return adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `❌ **Broadcast failed:** ${e.message}`, { parse_mode: 'Markdown' });
        }
    }

    if (text === '📢 Send Announcement') {
        adminState[DEFAULT_ADMIN_CHAT_ID] = { step: 'WAIT_ANNOUNCEMENT_TEXT' };
        return adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✍️ **Type and send your announcement/offer message below. It will be sent to all customers across all bots:**`, { parse_mode: 'Markdown' });
    }

    if (text === '📥 Instant DB Backup') {
        await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `⏳ **Generating Database Backup File...**`, { parse_mode: 'Markdown' });
        const users = await UserModel.find();
        const orders = await OrderModel.find().limit(2000);

        const backupData = { timestamp: new Date().toISOString(), totalUsers: users.length, users, orders };
        const backupPath = path.join(__dirname, `database_backup_${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

        await adminBot.sendDocument(DEFAULT_ADMIN_CHAT_ID, backupPath, { caption: `📊 **JPW ENTERPRISE INSTANT DATABASE BACKUP**` });
        fs.unlinkSync(backupPath);
        return;
    }

    if (text === '👥 Total Users Count') {
        const totalUsers = await UserModel.countDocuments();
        const activeOrders = await OrderModel.countDocuments({ status: { $in: ['Pending', 'Processing'] } });
        return adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `📊 **SYSTEM STATISTICS**\n\n👥 **Total Registered Users:** \`${totalUsers}\`\n📦 **Active/Pending Orders:** \`${activeOrders}\``, { parse_mode: 'Markdown' });
    }
});

adminBot.onText(/\/start|\/admin/, (msg) => {
    if (String(msg.chat.id) !== DEFAULT_ADMIN_CHAT_ID) return;
    adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `👑 **SUPER ADMIN CONTROL PANEL ACTIVE** ⚡`, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                [{ text: '📢 Send Announcement' }],
                [{ text: '📥 Instant DB Backup' }, { text: '👥 Total Users Count' }]
            ],
            resize_keyboard: true
        }
    });
});

// --- EXPRESS SERVER ---
app.get('/', (req, res) => {
    res.send('JPW Multi-Bot System Live & Running!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Multi-Bot SaaS Engine Live on Port ${PORT}`);
});
