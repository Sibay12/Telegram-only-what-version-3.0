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
const SUPPORT_BOT_TOKEN = '8736759061:AAGaSKOCQ9gUylCsqdAufHenEPeDQhQtSDU'; // Support Bot (Isolated)
const CUSTOMER_BOT_TOKENS = [
    '8874503246:AAEmdPcVJMQ3q6pmINsP_Tcwium3ANV4T6I', // Customer Bot #1
    '8972064227:AAG3LadKR0mLXJgU3xL6BwMy7TxjYz8N3Rw'  // Customer Bot #2
];

const DEFAULT_ADMIN_CHAT_ID = '7659178694';
const PORT = process.env.PORT || 3000;
const MONGO_URI = 'mongodb+srv://sibadityapal47_db_user:G95Dds7IGyBQNmGh@cluster0.yjvazin.mongodb.net/jpw_bot?retryWrites=true&w=majority';

// --- PACKAGES CONFIGURATION ---
const RECHARGE_PACKAGES = [
    { amount: 20, reaches: 1 },
    { amount: 50, reaches: 6 },
    { amount: 100, reaches: 7 },
    { amount: 200, reaches: 15 },
    { amount: 400, reaches: 33 },
    { amount: 800, reaches: 70 },
    { amount: 1000, reaches: 99 }
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
    pendingUtrAmount: { type: Number, default: null }
});

const orderSchema = new mongoose.Schema({
    custChatId: String,
    targetId: String,
    targetPass: String,
    status: { type: String, default: 'Pending' },
    adminMsgId: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', userSchema);
const OrderModel = mongoose.model('Order', orderSchema);

const adminBot = new TelegramBot(ADMIN_BOT_TOKEN, { polling: true });
const supportBot = new TelegramBot(SUPPORT_BOT_TOKEN, { polling: true });

let adminState = {}; 

async function initUser(chatId, firstName = 'User') {
    let user = await UserModel.findOne({ chatId: String(chatId) });
    if (!user) {
        user = new UserModel({ chatId: String(chatId), firstName: firstName || 'User', reaches: 0 });
        await user.save();
    }
    return user;
}

// -------------------------------------------------------------
// 🎧 SUPPORT BOT ENGINE (Strictly Isolated)
// -------------------------------------------------------------
supportBot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from ? msg.from.first_name : 'User';
    await initUser(chatId, firstName);

    supportBot.sendMessage(chatId, `🎧 **JPW OFFICIAL SUPPORT CENTER**\n\nनमस्ते **${firstName}**! अपनी समस्या या सवाल यहाँ लिखकर भेजें। यह मैसेज सीधे हमारी सपोर्ट टीम के पास जाएगा।`, {
        parse_mode: 'Markdown'
    });
});

supportBot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    if (chatId !== DEFAULT_ADMIN_CHAT_ID) {
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

        await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, alertText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '💬 Reply to User', callback_data: `reply_sup_${chatId}` }]]
            }
        });

        return supportBot.sendMessage(chatId, `✅ **आपका संदेश सपोर्ट टीम तक पहुँचा दिया गया है!**`, { parse_mode: 'Markdown' });
    }
});

// -------------------------------------------------------------
// ⏰ TIME-BASED AUTOMATED BROADCAST (7:00 AM to 9:30 PM, Every 30 Mins)
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
                    "☀️ Good Morning! क्या आपकी सेवाएँ बढ़िया चल रही हैं? JPW Enterprise के साथ जुड़े रहें।",
                    "🚀 Update: हमारे सर्वर पूरी रफ़्तार से काम कर रहे हैं। अपना आर्डर सबमिट करें!",
                    "💡 सुझाव: अपने वॉलेट में रीच मेन्टेन रखें ताकि आर्डर तुरंत प्रोसेस हो सके।",
                    "🌙 Evening Greetings! क्या आपको किसी सहायता की आवश्यकता है? सपोर्ट से संपर्क करें।"
                ];
                const randomMsg = messages[Math.floor(Math.random() * messages.length)];

                for (let u of users) {
                    CUSTOMER_BOT_TOKENS.forEach(token => {
                        const tempBot = new TelegramBot(token);
                        tempBot.sendMessage(u.chatId, `🤖 **JPW AUTO NOTIFICATION**\n\n${randomMsg}`, { parse_mode: 'Markdown' }).catch(() => {});
                    });
                }
            } catch (e) {}
        }

        if (mins === 0) {
            try {
                const lowUsers = await UserModel.find({ reaches: { $lte: 1 } });
                for (let u of lowUsers) {
                    CUSTOMER_BOT_TOKENS.forEach(token => {
                        const tempBot = new TelegramBot(token);
                        tempBot.sendMessage(u.chatId, `⚠️ **LOW BALANCE ALERT!**\n\nआपके अकाउंट में केवल **${u.reaches} Reach** बचा है। कृपया तुरंत रीचार्ज करें ताकि आपके आर्डर न रुकें।`, { parse_mode: 'Markdown' }).catch(() => {});
                    });
                }
            } catch (e) {}
        }
    }, 60 * 1000);
}

startEngagementScheduler();

// -------------------------------------------------------------
// 🤖 MULTI CUSTOMER BOTS ENGINE
// -------------------------------------------------------------
CUSTOMER_BOT_TOKENS.forEach(token => {
    const cBot = new TelegramBot(token, { polling: true });

    // /start Command Handler
    cBot.onText(/\/start/, async (msg) => {
        const chatId = String(msg.chat.id);
        const firstName = msg.from ? msg.from.first_name : 'Customer';
        let user = await initUser(chatId, firstName);

        const welcomeText = `
Hello!

You can contact bot administrators using this bot.

✨ **𝗝𝗣𝗪 𝗥𝗲𝗮𝗰𝗵 𝗦𝗲𝗿𝘃𝗶𝗰𝗲** ⚡

📌 **𝗕𝗲𝗳𝗼𝗿𝗲 𝗦𝗲𝗻𝗱𝗶𝗻𝗴 𝗜𝗗 & 𝗣𝗮𝘀𝘀:**
• ✅ Begin Journey me Workorder Assign hona chahiye.
• 🗺️ Map Open hona chahiye.
• 🔑 Agar ID/Password Expire ho gaya hai, pehle update karein, phir bot ko bhejein.

📩 **𝗘𝗸 𝗵𝗶 𝗺𝗲𝘀𝘀𝗮𝗴𝗲 𝗺𝗲 𝗯𝗵𝗲𝗷𝗲𝗶𝗻:**

TECHID PASSWORD

Example:
06181921 Pass@123#

⏳ Bot jitna Wait Time de, utna wait karein. Is dauran JPW Login na karein.

✅ Reach complete hone ke baad hi login karein.

🔒 Safe • Secure • Fast • Trusted — Unknown logon se Reach karwana avoid karein taaki account aur workorder safe rahe.

📦 **Your Subscription:**
• Plan: Starter+
• 📡 Remaining: ${user.reaches} reaches
• ⏱️ Expires: 2026-08-31
        `.trim();

        cBot.sendMessage(chatId, welcomeText, {
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

    // /buy Command Handler
    cBot.onText(/\/buy/, async (msg) => {
        const chatId = String(msg.chat.id);
        let pkgText = `🏷️ **SELECT A RECHARGE PACKAGE:**\n\nनीचे दिए गए पैकेज पर क्लिक करें, क्यूआर कोड आपके सामने आ जाएगा:`;
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

    // /yourplan Command Handler
    cBot.onText(/\/yourplan/, async (msg) => {
        const chatId = String(msg.chat.id);
        let user = await initUser(chatId, msg.from ? msg.from.first_name : 'Customer');

        const planText = `
📦 **YOUR SUBSCRIPTION PLAN:**
• Plan: Starter+
• 📡 Remaining: ${user.reaches} reaches
• ⏱️ Expires: 2026-08-31
        `.trim();

        return cBot.sendMessage(chatId, planText, { parse_mode: 'Markdown' });
    });

    cBot.on('message', async (msg) => {
        const chatId = String(msg.chat.id);
        const text = msg.text;
        if (!text || text.startsWith('/')) return;

        let user = await initUser(chatId, msg.from ? msg.from.first_name : 'User');

        if (text === '💬 Support') {
            return cBot.sendMessage(chatId, `🎧 **JPW OFFICIAL SUPPORT CENTER**\n\nकिसी भी समस्या या सहायता के लिए हमारे आधिकारिक सपोर्ट बॉट पर क्लिक करें:\n🔗 t.me/JPW_SUPPORT_ADMIN_BOT`, {
                parse_mode: 'Markdown'
            });
        }

        if (/^\d{12}$/.test(text.trim())) {
            const utr = text.trim();
            user.pendingUtrAmount = null;
            await user.save();

            let adminInlineKeyboard = RECHARGE_PACKAGES.map(pkg => [{
                text: `✅ Approve +${pkg.reaches} Reaches (₹${pkg.amount})`,
                callback_data: `appr_${chatId}_${pkg.reaches}`
            }]);
            adminInlineKeyboard.push([{ text: `❌ Reject UTR`, callback_data: `rej_${chatId}` }]);

            await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `💳 **NEW UTR SUBMITTED**\n\n👤 Customer: ${user.firstName} (\`${chatId}\`)\n🔢 UTR: \`${utr}\``, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: adminInlineKeyboard }
            });

            return cBot.sendMessage(chatId, `✅ **UTR Successfully Submitted!**\nपुराना QR कार्ड हटा दिया गया है। एडमिन द्वारा सत्यापित होते ही आपके रीच जोड़ दिए जाएंगे।`, {
                parse_mode: 'Markdown',
                reply_markup: { remove_keyboard: true }
            });
        }

        const orderMatch = text.trim().match(/^(\d{10})\s+(.+)$/);
        if (orderMatch) {
            const targetId = orderMatch[1];
            const targetPass = orderMatch[2];

            if (user.reaches < 1) {
                return cBot.sendMessage(chatId, `❌ **Insufficient Balance!** आपके पास पर्याप्त रीच नहीं है (न्यूनतम 1 Reach आवश्यक है)। कृपया रीचार्ज करें।`, { parse_mode: 'Markdown' });
            }

            user.reaches -= 1;
            await user.save();

            const newOrder = await OrderModel.create({ custChatId: chatId, targetId, targetPass });

            const adminMsg = await adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `⚡ **NEW ORDER RECEIVED**\n\n👤 Customer: \`${chatId}\`\n🎯 Target ID: \`${targetId}\`\n🔑 Password: \`${targetPass}\``, {
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

        if (text === '💳 Recharge Wallet') {
            let pkgText = `🏷️ **SELECT A RECHARGE PACKAGE:**\n\nनीचे दिए गए पैकेज पर क्लिक करें, क्यूआर कोड आपके सामने आ जाएगा:`;
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
                caption: `💳 **DYNAMIC QR CODE (₹${amount})**\n📦 Package: ${reaches} Reaches\n🆔 UPI: \`${upiId}\`\n\n👇 भुगतान करने के बाद **12-डिजिट UTR नंबर** इसी चैट में भेजें। UTR भेजते ही यह QR कार्ड हट जाएगा!`,
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

    if (data.startsWith('reply_sup_')) {
        const targetUserId = data.replace('reply_sup_', '');
        adminState[DEFAULT_ADMIN_CHAT_ID] = { step: 'WAIT_SUPPORT_REPLY', targetUserId };
        adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✍️ **User \`${targetUserId}\` के लिए सपोर्ट का जवाब भेजें:**`, { parse_mode: 'Markdown' });
        adminBot.answerCallbackQuery(query.id);
    }
    else if (data.startsWith('appr_')) {
        const parts = data.split('_');
        const targetChatId = parts[1];
        const reachesToAdd = parseInt(parts[2]);

        let user = await UserModel.findOne({ chatId: targetChatId });
        if (user) {
            user.reaches += reachesToAdd;
            await user.save();

            adminBot.editMessageCaption(`✅ **APPROVED!** Added +${reachesToAdd} Reaches to \`${targetChatId}\``, {
                chat_id: DEFAULT_ADMIN_CHAT_ID, message_id: query.message.message_id, parse_mode: 'Markdown'
            });

            CUSTOMER_BOT_TOKENS.forEach(token => {
                const tempBot = new TelegramBot(token);
                tempBot.sendMessage(targetChatId, `🎉 **RECHARGE APPROVED!**\nआपके अकाउंट में **+${reachesToAdd} Reaches** जोड़ दिए गए हैं।`, { parse_mode: 'Markdown' }).catch(() => {});
            });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Recharge Approved!" });
    }
    else if (data.startsWith('rej_')) {
        const targetChatId = data.replace('rej_', '');
        adminBot.editMessageCaption(`❌ **UTR REJECTED!**`, {
            chat_id: DEFAULT_ADMIN_CHAT_ID, message_id: query.message.message_id, parse_mode: 'Markdown'
        });
        CUSTOMER_BOT_TOKENS.forEach(token => {
            const tempBot = new TelegramBot(token);
            tempBot.sendMessage(targetChatId, `❌ **RECHARGE REJECTED!** आपका UTR अमान्य पाया गया है। कृपया सही UTR भेजें।`, { parse_mode: 'Markdown' }).catch(() => {});
        });
        adminBot.answerCallbackQuery(query.id, { text: "UTR Rejected!" });
    }
    else if (data.startsWith('acc_ord_')) {
        const orderId = data.replace('acc_ord_', '');
        const order = await OrderModel.findById(orderId);

        if (order) {
            order.status = 'Processing';
            await order.save();

            adminState[DEFAULT_ADMIN_CHAT_ID] = { step: 'WAIT_FEEDBACK_TEXT', orderId };
            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✍️ **इन-प्रोसैस (In-Process) सेट हो गया है!**\nअब कस्टमर के लिए जो फीडबैक/टेक्स्ट भेजना चाहते हैं, वह टाइप करके यहाँ भेजें:`, { parse_mode: 'Markdown' });

            adminBot.editMessageReplyMarkup({
                inline_keyboard: [[
                    { text: '✅ Complete Order', callback_data: `comp_ord_${orderId}` },
                    { text: '❌ Cancel & Refund', callback_data: `canc_ord_${orderId}` }
                ]]
            }, { chat_id: DEFAULT_ADMIN_CHAT_ID, message_id: query.message.message_id });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Marked In-Process!" });
    }
    else if (data.startsWith('comp_ord_')) {
        const orderId = data.replace('comp_ord_', '');
        const order = await OrderModel.findById(orderId);

        if (order) {
            order.status = 'Completed';
            await order.save();

            adminBot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: DEFAULT_ADMIN_CHAT_ID, message_id: query.message.message_id });
            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `🎉 **Order Completed Successfully for Target ID: ${order.targetId}**`, { parse_mode: 'Markdown' });

            CUSTOMER_BOT_TOKENS.forEach(token => {
                const tempBot = new TelegramBot(token);
                tempBot.sendMessage(order.custChatId, `🎉 **YOUR ORDER HAS BEEN COMPLETED SUCCESSFULLY!**\nTarget ID: \`${order.targetId}\``, { parse_mode: 'Markdown' }).catch(() => {});
            });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Order Completed!" });
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

            adminBot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: DEFAULT_ADMIN_CHAT_ID, message_id: query.message.message_id });
            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `❌ **Order Cancelled & 1 Reach Refunded to User!**`, { parse_mode: 'Markdown' });

            CUSTOMER_BOT_TOKENS.forEach(token => {
                const tempBot = new TelegramBot(token);
                tempBot.sendMessage(order.custChatId, `❌ **YOUR ORDER WAS CANCELLED!**\nआपका 1 Reach वॉलेट में वापस रिफंड कर दिया गया है।`, { parse_mode: 'Markdown' }).catch(() => {});
            });
        }
        adminBot.answerCallbackQuery(query.id, { text: "Order Cancelled & Refunded!" });
    }
});

adminBot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    if (chatId !== DEFAULT_ADMIN_CHAT_ID) return;

    const text = msg.text;
    if (!text) return;

    if (adminState[DEFAULT_ADMIN_CHAT_ID]?.step === 'WAIT_SUPPORT_REPLY') {
        const targetUserId = adminState[DEFAULT_ADMIN_CHAT_ID].targetUserId;
        adminState[DEFAULT_ADMIN_CHAT_ID] = null;
        const replyText = text;

        try {
            await supportBot.sendMessage(targetUserId, `👨‍💻 **SUPPORT TEAM REPLY:**\n\n${replyText}`, { parse_mode: 'Markdown' });
            return adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✅ **सपोर्ट का जवाब यूज़र तक सफलतापूर्वक भेज दिया गया है!**`, { parse_mode: 'Markdown' });
        } catch (e) {
            return adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `❌ **मैसेज भेजने में विफल:** ${e.message}`, { parse_mode: 'Markdown' });
        }
    }

    if (adminState[DEFAULT_ADMIN_CHAT_ID]?.step === 'WAIT_FEEDBACK_TEXT') {
        const orderId = adminState[DEFAULT_ADMIN_CHAT_ID].orderId;
        adminState[DEFAULT_ADMIN_CHAT_ID] = null;
        const feedbackText = text;

        const order = await OrderModel.findById(orderId);
        if (order) {
            CUSTOMER_BOT_TOKENS.forEach(token => {
                const tempBot = new TelegramBot(token);
                tempBot.sendMessage(order.custChatId, `ℹ️ **ADMIN UPDATE / FEEDBACK:**\n\n${feedbackText}`, { parse_mode: 'Markdown' }).catch(() => {});
            });
            adminBot.sendMessage(DEFAULT_ADMIN_CHAT_ID, `✅ **फीडबैक/टेक्स्ट कस्टमर तक सफलतापर्वक भेज दिया गया है!**`, { parse_mode: 'Markdown' });
        }
        return;
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
