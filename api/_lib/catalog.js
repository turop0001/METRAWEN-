// Каталог услуг для КП (из калькулятора на сайте). USD = рубли / 82.
const RATE = 82;
const ITEMS = [
{
"id": "a_site",
"rub": 24900,
"days": 4,
"ru": {
"nm": "Лендинг: Базовый",
"sol": "Страница, на которую можно вести рекламу и подписчиков",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Landing page: Basic",
"sol": "A page you can send ad traffic and followers to",
"cat": "Websites and pages"
}
},
{
"id": "a_site_pro",
"rub": 39900,
"days": 6,
"ru": {
"nm": "Лендинг PRO",
"sol": "Лендинг, который снимает сомнения клиента до звонка",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Landing page PRO",
"sol": "A landing page that clears up doubts before the first call",
"cat": "Websites and pages"
}
},
{
"id": "a_msite_start",
"rub": 84900,
"days": 10,
"ru": {
"nm": "Сайт Start",
"sol": "Многостраничный сайт вместо одного лендинга — когда для одной страницы информации уже мало",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Website Start",
"sol": "A multi-page website instead of a single landing page, for when one page isn't enough",
"cat": "Websites and pages"
}
},
{
"id": "a_msite_pro",
"rub": 119500,
"days": 15,
"ru": {
"nm": "Сайт PRO",
"sol": "Корпоративный сайт с блогом и усиленными блоками доверия — для тех, кто работает на репутацию и SEO-трафик",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Website PRO",
"sol": "A company website with a blog and stronger trust sections, for businesses that grow on reputation and SEO traffic",
"cat": "Websites and pages"
}
},
{
"id": "a_page",
"rub": 7900,
"days": 2,
"ru": {
"nm": "Ещё одна страница сайта",
"sol": "Отдельная посадочная под вторую услугу или акцию",
"cat": "Сайт и страницы"
},
"en": {
"nm": "One more page",
"sol": "A separate landing page for a second service or a promotion",
"cat": "Websites and pages"
}
},
{
"id": "a_lang",
"rub": 9900,
"days": 2,
"ru": {
"nm": "Вторая языковая версия",
"sol": "Тот же сайт на английском или другом языке",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Second language version",
"sol": "The same website in another language",
"cat": "Websites and pages"
}
},
{
"id": "a_domain",
"rub": 5900,
"days": 1,
"ru": {
"nm": "Домен, хостинг и аналитика",
"sol": "Подключение домена к хостингу и настройка аналитики",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Domain, hosting and analytics",
"sol": "Connecting your domain to hosting and setting up analytics",
"cat": "Websites and pages"
}
},
{
"id": "a_anim",
"rub": 9900,
"days": 2,
"ru": {
"nm": "Кастомная анимация и скролл-эффекты",
"sol": "Блоки появляются при прокрутке, а не просто лежат на странице",
"cat": "Сайт и страницы"
},
"en": {
"nm": "Custom animation and scroll effects",
"sol": "Sections appear as you scroll instead of just sitting on the page",
"cat": "Websites and pages"
}
},
{
"id": "a_bot",
"rub": 19900,
"days": 4,
"ru": {
"nm": "Чат-бот в Telegram: Базовый",
"sol": "Записывает клиентов и собирает заявки, пока вы заняты",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "Telegram / WhatsApp chatbot: Basic",
"sol": "Books clients and collects inquiries while you're busy",
"cat": "Bots and AI assistants"
}
},
{
"id": "a_bot_pro",
"rub": 34900,
"days": 6,
"ru": {
"nm": "Чат-бот в Telegram PRO",
"sol": "Бот, который не только записывает, но и возвращает клиентов и деньги",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "Telegram / WhatsApp chatbot PRO",
"sol": "A bot that doesn't just take bookings but brings customers and money back",
"cat": "Bots and AI assistants"
}
},
{
"id": "a_bot_shop",
"rub": 39900,
"days": 7,
"ru": {
"nm": "Telegram-бот с корзиной",
"sol": "Магазин или доставка прямо в Telegram: меню, корзина, заказ",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "Chatbot with a shopping cart",
"sol": "A store or delivery service right inside the messenger: menu, cart, order",
"cat": "Bots and AI assistants"
}
},
{
"id": "a_bot_subs",
"rub": 49500,
"days": 8,
"ru": {
"nm": "Telegram-бот с абонементами",
"sol": "Клуб или студия продаёт абонементы и записывает на занятия без администратора",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "Chatbot with memberships",
"sol": "A club or studio sells memberships and books classes with no front desk needed",
"cat": "Bots and AI assistants"
}
},
{
"id": "a_bot_max",
"rub": 24900,
"days": 5,
"ru": {
"nm": "Чат-бот в MAX",
"sol": "Тот же сценарный бот, что и Telegram-бот Базовый, — в российском мессенджере MAX",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "Чат-бот в MAX",
"sol": "",
"cat": ""
}
},
{
"id": "a_bot_mig",
"rub": 21900,
"days": 3,
"ru": {
"nm": "Перенос бота из Telegram в MAX",
"sol": "Уже работающий бот получает вторую версию в MAX",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "Перенос бота из Telegram в MAX",
"sol": "",
"cat": ""
}
},
{
"id": "a_ai",
"rub": 39500,
"days": 6,
"ru": {
"nm": "AI-ассистент на частые вопросы",
"sol": "Отвечает на типовые вопросы о компании, ценах и услугах, остальное — человеку",
"cat": "Боты и AI-ассистенты"
},
"en": {
"nm": "AI assistant for FAQs",
"sol": "Answers common questions about your company, prices and services, and hands the rest to a person",
"cat": "Bots and AI assistants"
}
},
{
"id": "a_crm_link",
"rub": 9900,
"days": 2,
"ru": {
"nm": "Подключение к вашей CRM",
"sol": "Связываем сайт и бота с уже существующей системой",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Connecting to your CRM",
"sol": "We connect your website and bot to the system you already use",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_crm_own",
"rub": 69500,
"days": 10,
"ru": {
"nm": "Персональная мини-CRM: Базовая",
"sol": "Своя система учёта клиентов и сделок, если готовой CRM нет",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Custom mini-CRM: Basic",
"sol": "Your own system for tracking customers and deals if you don't have a CRM",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_crm_pro",
"rub": 119500,
"days": 18,
"ru": {
"nm": "Персональная мини-CRM PRO",
"sol": "CRM для команды: роли, автоматизации и аналитика по деньгам",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Custom mini-CRM PRO",
"sol": "A CRM for your team: roles, automations and revenue analytics",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_pay",
"rub": 9900,
"days": 2,
"ru": {
"nm": "Приём оплаты на сайте",
"sol": "Кнопка «оплатить» с чеком, без переводов на карту",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Accepting payments on your website",
"sol": "A \"Pay\" button with a receipt, no manual bank transfers",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_sheets",
"rub": 12900,
"days": 2,
"ru": {
"nm": "Автоотчёт в таблице",
"sol": "Таблица считает сама, без ручной сводки по вечерам",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Automated spreadsheet report",
"sol": "A spreadsheet that does the math, no manual tallying at night",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_data",
"rub": 12900,
"days": 3,
"ru": {
"nm": "Сбор данных о рынке",
"sol": "Цены и позиции конкурентов в одной таблице",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Market data collection",
"sol": "Competitor prices and positions in one spreadsheet",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_dash_prices",
"rub": 39900,
"days": 7,
"ru": {
"nm": "Дашборд мониторинга цен конкурентов",
"sol": "Видите цены конкурентов каждое утро и понимаете, где теряете продажи",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Competitor price monitoring dashboard",
"sol": "See competitor prices every morning and know where you're losing sales",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_dash_content",
"rub": 29900,
"days": 6,
"ru": {
"nm": "Дашборд аналитики Telegram-канала",
"sol": "Видите, какой контент приводит подписчиков, без ручных подсчётов",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Social media analytics dashboard",
"sol": "See which content brings in followers, without counting by hand",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_dash_mp",
"rub": 49900,
"days": 8,
"ru": {
"nm": "Дашборд продаж на Wildberries и Ozon",
"sol": "Видите, сколько реально зарабатывает каждый товар после комиссий, логистики и рекламы",
"cat": "Продажи, данные и учёт"
},
"en": {
"nm": "Amazon and Walmart sales dashboard",
"sol": "See how much each product really earns after fees, shipping and ads",
"cat": "Sales, data and bookkeeping"
}
},
{
"id": "a_seo",
"rub": 15900,
"days": 3,
"ru": {
"nm": "SEO-структура сайта",
"sol": "Чтобы сайт находили в поиске, а не только по рекламе",
"cat": "Продвижение и контент"
},
"en": {
"nm": "SEO site structure",
"sol": "So your website gets found in search, not just through ads",
"cat": "Marketing and content"
}
},
{
"id": "a_ident",
"rub": 14900,
"days": 3,
"ru": {
"nm": "Логотип и фирменный стиль",
"sol": "Единый вид на сайте, в канале и в соцсетях",
"cat": "Продвижение и контент"
},
"en": {
"nm": "Logo and brand identity",
"sol": "One consistent look across your website, channels and social media",
"cat": "Marketing and content"
}
},
{
"id": "a_texts",
"rub": 9900,
"days": 3,
"ru": {
"nm": "Тексты: 10 штук разово",
"sol": "Разовый пакет текстов, не подписка",
"cat": "Продвижение и контент"
},
"en": {
"nm": "Copywriting: 10 pieces, one-time",
"sol": "A one-time copy package, not a subscription",
"cat": "Marketing and content"
}
},
{
"id": "a_reels",
"rub": 12900,
"days": 4,
"ru": {
"nm": "Сценарии для Reels и Shorts",
"sol": "8–12 роликов по готовому плану",
"cat": "Продвижение и контент"
},
"en": {
"nm": "Scripts for Reels and Shorts",
"sol": "8–12 videos from a ready-made plan",
"cat": "Marketing and content"
}
},
{
"id": "a_calc",
"rub": 14900,
"days": 3,
"ru": {
"nm": "Калькулятор стоимости на сайт",
"sol": "Посетитель отмечает опции и сразу видит цену",
"cat": "Виджеты и инструменты"
},
"en": {
"nm": "Price calculator for your website",
"sol": "Visitors check options and see the price instantly",
"cat": "Widgets and tools"
}
},
{
"id": "a_calc_pro",
"rub": 24900,
"days": 5,
"ru": {
"nm": "Калькулятор с валютами и сложной логикой",
"sol": "То же самое плюс валюты, скидки и зависимые опции",
"cat": "Виджеты и инструменты"
},
"en": {
"nm": "Calculator with currencies and complex logic",
"sol": "The same, plus currencies, discounts and dependent options",
"cat": "Widgets and tools"
}
},
{
"id": "a_quiz",
"rub": 17900,
"days": 4,
"ru": {
"nm": "Квиз подбора с заявкой",
"sol": "Посетитель отвечает на пять вопросов и оставляет телефон уже с готовой подборкой",
"cat": "Виджеты и инструменты"
},
"en": {
"nm": "Matching quiz with a lead form",
"sol": "Visitors answer five questions and leave their phone number with a ready shortlist",
"cat": "Widgets and tools"
}
},
{
"id": "a_calc_mort",
"rub": 19900,
"days": 4,
"ru": {
"nm": "Ипотечный калькулятор",
"sol": "Клиент видит платёж, переплату и нужный доход до разговора с менеджером",
"cat": "Виджеты и инструменты"
},
"en": {
"nm": "Mortgage calculator",
"sol": "Clients see the payment, total interest and required income before talking to an agent",
"cat": "Widgets and tools"
}
},
{
"id": "a_catalog",
"rub": 29900,
"days": 5,
"ru": {
"nm": "Каталог объектов с фильтрами",
"sol": "Клиент сам находит объект и сразу записывается на просмотр",
"cat": "Виджеты и инструменты"
},
"en": {
"nm": "Property listings with filters",
"sol": "Clients find a property themselves and book a showing right away",
"cat": "Widgets and tools"
}
}
];
module.exports = { ITEMS, RATE };
