import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  Languages, ArrowRight, ArrowLeftRight, Volume2, Copy, Check,
  MapPin, Utensils, Train, Hotel, Heart, Shield,
  Navigation, Loader, Globe, Search, X, AlertCircle
} from 'lucide-react';

// ---- Mock Translation Database ----
const translationDB = {
  Hindi: {
    greetings: [
      { en: 'Hello', local: 'नमस्ते (Namaste)' },
      { en: 'Thank you', local: 'धन्यवाद (Dhanyavaad)' },
      { en: 'Excuse me', local: 'माफ़ कीजिए (Maaf kijiye)' },
      { en: 'Goodbye', local: 'अलविदा (Alvida)' },
      { en: 'Yes / No', local: 'हाँ / नहीं (Haan / Nahi)' },
      { en: 'Please', local: 'कृपया (Kripya)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'क्या मैं मेनू देख सकता हूँ? (Kya main menu dekh sakta hoon?)' },
      { en: 'I am vegetarian', local: 'मैं शाकाहारी हूँ (Main shakahari hoon)' },
      { en: 'Water, please', local: 'पानी दीजिए (Paani dijiye)' },
      { en: 'The bill, please', local: 'बिल दीजिए (Bill dijiye)' },
      { en: 'This is delicious!', local: 'यह बहुत स्वादिष्ट है! (Yeh bahut swadisht hai!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'रेलवे स्टेशन कहाँ है? (Railway station kahaan hai?)' },
      { en: 'How far is it?', local: 'यह कितनी दूर है? (Yeh kitni door hai?)' },
      { en: 'Turn left / right', local: 'बाएँ / दाएँ मुड़ें (Baayein / Daayein mudein)' },
      { en: 'I am lost', local: 'मैं खो गया हूँ (Main kho gaya hoon)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'मुझे मदद चाहिए! (Mujhe madad chahiye!)' },
      { en: 'Call an ambulance!', local: 'एम्बुलेंस बुलाओ! (Ambulance bulao!)' },
      { en: 'Call the police!', local: 'पुलिस को बुलाओ! (Police ko bulao!)' },
      { en: 'I don\'t feel well', local: 'मेरी तबीयत ठीक नहीं है (Meri tabiyat theek nahi hai)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'मेरा रिज़र्वेशन है (Mera reservation hai)' },
      { en: 'What time is checkout?', local: 'चेकआउट कितने बजे है? (Checkout kitne baje hai?)' },
      { en: 'Where is the bathroom?', local: 'बाथरूम कहाँ है? (Bathroom kahaan hai?)' },
    ],
  },
  Japanese: {
    greetings: [
      { en: 'Hello', local: 'こんにちは (Konnichiwa)' },
      { en: 'Thank you very much', local: 'どうもありがとうございます (Dōmo arigatō gozaimasu)' },
      { en: 'Excuse me', local: 'すみません (Sumimasen)' },
      { en: 'Goodbye', local: 'さようなら (Sayōnara)' },
      { en: 'Yes / No', local: 'はい / いいえ (Hai / Iie)' },
      { en: 'Please', local: 'お願いします (Onegai shimasu)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'メニューを見せてください (Menyū wo misete kudasai)' },
      { en: 'I am vegetarian', local: '私はベジタリアンです (Watashi wa bejitarian desu)' },
      { en: 'Water, please', local: 'お水をお願いします (Omizu wo onegai shimasu)' },
      { en: 'The check, please', local: 'お会計お願いします (Okaikei onegai shimasu)' },
      { en: 'This is delicious!', local: 'おいしいです！ (Oishii desu!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: '駅はどこですか？ (Eki wa doko desu ka?)' },
      { en: 'How far is it?', local: 'どのくらい遠いですか？ (Dono kurai tōi desu ka?)' },
      { en: 'Turn left / right', local: '左 / 右に曲がってください (Hidari / Migi ni magatte kudasai)' },
      { en: 'I am lost', local: '迷いました (Mayoimashita)' },
    ],
    emergency: [
      { en: 'I need help!', local: '助けてください！ (Tasukete kudasai!)' },
      { en: 'Call an ambulance!', local: '救急車を呼んでください！ (Kyūkyūsha wo yonde kudasai!)' },
      { en: 'Call the police!', local: '警察を呼んでください！ (Keisatsu wo yonde kudasai!)' },
      { en: 'I don\'t feel well', local: '気分が悪いです (Kibun ga warui desu)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: '予約があります (Yoyaku ga arimasu)' },
      { en: 'What time is checkout?', local: 'チェックアウトは何時ですか？ (Chekkuauto wa nanji desu ka?)' },
      { en: 'Where is the bathroom?', local: 'トイレはどこですか？ (Toire wa doko desu ka?)' },
    ],
  },
  French: {
    greetings: [
      { en: 'Hello', local: 'Bonjour' },
      { en: 'Thank you', local: 'Merci beaucoup' },
      { en: 'Excuse me', local: 'Excusez-moi' },
      { en: 'Goodbye', local: 'Au revoir' },
      { en: 'Yes / No', local: 'Oui / Non' },
      { en: 'Please', local: 'S\'il vous plaît' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'Puis-je voir le menu ?' },
      { en: 'I am vegetarian', local: 'Je suis végétarien(ne)' },
      { en: 'Water, please', local: 'De l\'eau, s\'il vous plaît' },
      { en: 'The check, please', local: 'L\'addition, s\'il vous plaît' },
      { en: 'This is delicious!', local: 'C\'est délicieux !' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'Où est la gare ?' },
      { en: 'How far is it?', local: 'C\'est à quelle distance ?' },
      { en: 'Turn left / right', local: 'Tournez à gauche / droite' },
      { en: 'I am lost', local: 'Je suis perdu(e)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'J\'ai besoin d\'aide !' },
      { en: 'Call an ambulance!', local: 'Appelez une ambulance !' },
      { en: 'Call the police!', local: 'Appelez la police !' },
      { en: 'I don\'t feel well', local: 'Je ne me sens pas bien' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'J\'ai une réservation' },
      { en: 'What time is checkout?', local: 'À quelle heure est le départ ?' },
      { en: 'Where is the bathroom?', local: 'Où sont les toilettes ?' },
    ],
  },
  Spanish: {
    greetings: [
      { en: 'Hello', local: 'Hola' },
      { en: 'Thank you', local: 'Muchas gracias' },
      { en: 'Excuse me', local: 'Disculpe' },
      { en: 'Goodbye', local: 'Adiós' },
      { en: 'Yes / No', local: 'Sí / No' },
      { en: 'Please', local: 'Por favor' },
    ],
    food: [
      { en: 'Can I see the menu?', local: '¿Puedo ver el menú?' },
      { en: 'I am vegetarian', local: 'Soy vegetariano/a' },
      { en: 'Water, please', local: 'Agua, por favor' },
      { en: 'The bill, please', local: 'La cuenta, por favor' },
      { en: 'This is delicious!', local: '¡Está delicioso!' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: '¿Dónde está la estación de tren?' },
      { en: 'How far is it?', local: '¿Qué tan lejos está?' },
      { en: 'Turn left / right', local: 'Gire a la izquierda / derecha' },
      { en: 'I am lost', local: 'Estoy perdido/a' },
    ],
    emergency: [
      { en: 'I need help!', local: '¡Necesito ayuda!' },
      { en: 'Call an ambulance!', local: '¡Llame una ambulancia!' },
      { en: 'Call the police!', local: '¡Llame a la policía!' },
      { en: 'I don\'t feel well', local: 'No me siento bien' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'Tengo una reservación' },
      { en: 'What time is checkout?', local: '¿A qué hora es la salida?' },
      { en: 'Where is the bathroom?', local: '¿Dónde está el baño?' },
    ],
  },
  German: {
    greetings: [
      { en: 'Hello', local: 'Hallo / Guten Tag' },
      { en: 'Thank you', local: 'Vielen Dank' },
      { en: 'Excuse me', local: 'Entschuldigung' },
      { en: 'Goodbye', local: 'Auf Wiedersehen' },
      { en: 'Yes / No', local: 'Ja / Nein' },
      { en: 'Please', local: 'Bitte' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'Kann ich die Speisekarte sehen?' },
      { en: 'I am vegetarian', local: 'Ich bin Vegetarier/in' },
      { en: 'Water, please', local: 'Wasser, bitte' },
      { en: 'The bill, please', local: 'Die Rechnung, bitte' },
      { en: 'This is delicious!', local: 'Das ist köstlich!' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'Wo ist der Bahnhof?' },
      { en: 'How far is it?', local: 'Wie weit ist es?' },
      { en: 'Turn left / right', local: 'Biegen Sie links / rechts ab' },
      { en: 'I am lost', local: 'Ich habe mich verirrt' },
    ],
    emergency: [
      { en: 'I need help!', local: 'Ich brauche Hilfe!' },
      { en: 'Call an ambulance!', local: 'Rufen Sie einen Krankenwagen!' },
      { en: 'Call the police!', local: 'Rufen Sie die Polizei!' },
      { en: 'I don\'t feel well', local: 'Mir geht es nicht gut' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'Ich habe eine Reservierung' },
      { en: 'What time is checkout?', local: 'Wann ist der Check-out?' },
      { en: 'Where is the bathroom?', local: 'Wo ist das Badezimmer?' },
    ],
  },
  Arabic: {
    greetings: [
      { en: 'Hello', local: 'مرحبا (Marhaba)' },
      { en: 'Thank you', local: 'شكرا (Shukran)' },
      { en: 'Excuse me', local: 'عفوا (Afwan)' },
      { en: 'Goodbye', local: 'مع السلامة (Ma\'a salama)' },
      { en: 'Yes / No', local: 'نعم / لا (Na\'am / La)' },
      { en: 'Please', local: 'من فضلك (Min fadlak)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'هل يمكنني رؤية القائمة؟ (Hal yumkinuni ru\'yat alqa\'ima?)' },
      { en: 'I am vegetarian', local: 'أنا نباتي (Ana nabati)' },
      { en: 'Water, please', local: 'ماء من فضلك (Ma\' min fadlak)' },
      { en: 'The bill, please', local: 'الفاتورة من فضلك (Alfatoura min fadlak)' },
      { en: 'This is delicious!', local: '!هذا لذيذ (Hadha ladhidh!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'أين محطة القطار؟ (Ayna mahattat alqitar?)' },
      { en: 'How far is it?', local: 'كم تبعد؟ (Kam tab\'ud?)' },
      { en: 'Turn left / right', local: 'انعطف يسار / يمين (In\'atif yasar / yamin)' },
      { en: 'I am lost', local: 'أنا ضائع (Ana da\'i)' },
    ],
    emergency: [
      { en: 'I need help!', local: '!أحتاج مساعدة (Ahtaj musa\'ada!)' },
      { en: 'Call an ambulance!', local: '!اتصل بالإسعاف (Ittasil bil-is\'af!)' },
      { en: 'Call the police!', local: '!اتصل بالشرطة (Ittasil bi-ash-shurta!)' },
      { en: 'I don\'t feel well', local: 'لا أشعر بحالة جيدة (La ash\'ur bihala jayida)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'لدي حجز (Ladayya hajz)' },
      { en: 'What time is checkout?', local: 'متى موعد تسجيل الخروج؟ (Mata maw\'id tasjil alkhuruj?)' },
      { en: 'Where is the bathroom?', local: 'أين الحمام؟ (Ayna alhammam?)' },
    ],
  },
  Korean: {
    greetings: [
      { en: 'Hello', local: '안녕하세요 (Annyeonghaseyo)' },
      { en: 'Thank you', local: '감사합니다 (Gamsahamnida)' },
      { en: 'Excuse me', local: '실례합니다 (Sillyehamnida)' },
      { en: 'Goodbye', local: '안녕히 가세요 (Annyeonghi gaseyo)' },
      { en: 'Yes / No', local: '네 / 아니요 (Ne / Aniyo)' },
      { en: 'Please', local: '부탁합니다 (Butakhamnida)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: '메뉴를 볼 수 있나요? (Menyureul bol su innayo?)' },
      { en: 'I am vegetarian', local: '저는 채식주의자입니다 (Jeoneun chaesikjuuijaimnida)' },
      { en: 'Water, please', local: '물 주세요 (Mul juseyo)' },
      { en: 'The bill, please', local: '계산서 주세요 (Gyesanseo juseyo)' },
      { en: 'This is delicious!', local: '맛있어요! (Masisseoyo!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: '기차역이 어디예요? (Gichayeogi eodiyeyo?)' },
      { en: 'How far is it?', local: '얼마나 멀어요? (Eolmana meoreoyo?)' },
      { en: 'Turn left / right', local: '왼쪽 / 오른쪽으로 가세요 (Oenjjok / Oreunjjogeuro gaseyo)' },
      { en: 'I am lost', local: '길을 잃었어요 (Gireul ilheosseoyo)' },
    ],
    emergency: [
      { en: 'I need help!', local: '도와주세요! (Dowajuseyo!)' },
      { en: 'Call an ambulance!', local: '구급차를 불러주세요! (Gugeupchareul bulleojuseyo!)' },
      { en: 'Call the police!', local: '경찰을 불러주세요! (Gyeongchareul bulleojuseyo!)' },
      { en: 'I don\'t feel well', local: '몸이 안 좋아요 (Momi an joayo)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: '예약했습니다 (Yeyakhaesseumnida)' },
      { en: 'What time is checkout?', local: '체크아웃은 몇 시예요? (Chekeuauseun myeot siyeyo?)' },
      { en: 'Where is the bathroom?', local: '화장실이 어디예요? (Hwajangsili eodiyeyo?)' },
    ],
  },
  Chinese: {
    greetings: [
      { en: 'Hello', local: '你好 (Nǐ hǎo)' },
      { en: 'Thank you', local: '谢谢 (Xièxiè)' },
      { en: 'Excuse me', local: '不好意思 (Bù hǎo yìsi)' },
      { en: 'Goodbye', local: '再见 (Zàijiàn)' },
      { en: 'Yes / No', local: '是 / 不是 (Shì / Bùshì)' },
      { en: 'Please', local: '请 (Qǐng)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: '我可以看菜单吗？ (Wǒ kěyǐ kàn càidān ma?)' },
      { en: 'I am vegetarian', local: '我是素食者 (Wǒ shì sùshí zhě)' },
      { en: 'Water, please', local: '请给我水 (Qǐng gěi wǒ shuǐ)' },
      { en: 'The bill, please', local: '请买单 (Qǐng mǎidān)' },
      { en: 'This is delicious!', local: '很好吃！ (Hěn hǎochī!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: '火车站在哪里？ (Huǒchē zhàn zài nǎlǐ?)' },
      { en: 'How far is it?', local: '有多远？ (Yǒu duō yuǎn?)' },
      { en: 'Turn left / right', local: '左转 / 右转 (Zuǒ zhuǎn / Yòu zhuǎn)' },
      { en: 'I am lost', local: '我迷路了 (Wǒ mílù le)' },
    ],
    emergency: [
      { en: 'I need help!', local: '我需要帮助！ (Wǒ xūyào bāngzhù!)' },
      { en: 'Call an ambulance!', local: '叫救护车！ (Jiào jiùhù chē!)' },
      { en: 'Call the police!', local: '叫警察！ (Jiào jǐngchá!)' },
      { en: 'I don\'t feel well', local: '我不舒服 (Wǒ bù shūfú)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: '我有预订 (Wǒ yǒu yùdìng)' },
      { en: 'What time is checkout?', local: '退房时间是几点？ (Tuì fáng shíjiān shì jǐ diǎn?)' },
      { en: 'Where is the bathroom?', local: '洗手间在哪里？ (Xǐshǒujiān zài nǎlǐ?)' },
    ],
  },
  Russian: {
    greetings: [
      { en: 'Hello', local: 'Здравствуйте (Zdravstvuyte)' },
      { en: 'Thank you', local: 'Спасибо (Spasibo)' },
      { en: 'Excuse me', local: 'Извините (Izvinite)' },
      { en: 'Goodbye', local: 'До свидания (Do svidaniya)' },
      { en: 'Yes / No', local: 'Да / Нет (Da / Nyet)' },
      { en: 'Please', local: 'Пожалуйста (Pozhaluysta)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'Можно меню? (Mozhno menyu?)' },
      { en: 'I am vegetarian', local: 'Я вегетарианец (Ya vegetarianets)' },
      { en: 'Water, please', local: 'Воду, пожалуйста (Vodu, pozhaluysta)' },
      { en: 'The bill, please', local: 'Счёт, пожалуйста (Schyot, pozhaluysta)' },
      { en: 'This is delicious!', local: 'Это вкусно! (Eto vkusno!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'Где вокзал? (Gde vokzal?)' },
      { en: 'How far is it?', local: 'Как далеко? (Kak daleko?)' },
      { en: 'Turn left / right', local: 'Поверните налево / направо (Povernite nalevo / napravo)' },
      { en: 'I am lost', local: 'Я заблудился (Ya zabludilsya)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'Мне нужна помощь! (Mne nuzhna pomoshch!)' },
      { en: 'Call an ambulance!', local: 'Вызовите скорую! (Vyzovite skoruyu!)' },
      { en: 'Call the police!', local: 'Вызовите полицию! (Vyzovite politsiyu!)' },
      { en: 'I don\'t feel well', local: 'Мне плохо (Mne plokho)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'У меня бронь (U menya bron\')' },
      { en: 'What time is checkout?', local: 'Во сколько выезд? (Vo skol\'ko vyezd?)' },
      { en: 'Where is the bathroom?', local: 'Где туалет? (Gde tualet?)' },
    ],
  },
  Portuguese: {
    greetings: [
      { en: 'Hello', local: 'Olá' },
      { en: 'Thank you', local: 'Muito obrigado/a' },
      { en: 'Excuse me', local: 'Com licença' },
      { en: 'Goodbye', local: 'Adeus / Tchau' },
      { en: 'Yes / No', local: 'Sim / Não' },
      { en: 'Please', local: 'Por favor' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'Posso ver o cardápio?' },
      { en: 'I am vegetarian', local: 'Eu sou vegetariano/a' },
      { en: 'Water, please', local: 'Água, por favor' },
      { en: 'The bill, please', local: 'A conta, por favor' },
      { en: 'This is delicious!', local: 'Está delicioso!' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'Onde fica a estação de trem?' },
      { en: 'How far is it?', local: 'Quão longe é?' },
      { en: 'Turn left / right', local: 'Vire à esquerda / direita' },
      { en: 'I am lost', local: 'Estou perdido/a' },
    ],
    emergency: [
      { en: 'I need help!', local: 'Preciso de ajuda!' },
      { en: 'Call an ambulance!', local: 'Chame uma ambulância!' },
      { en: 'Call the police!', local: 'Chame a polícia!' },
      { en: 'I don\'t feel well', local: 'Não estou me sentindo bem' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'Eu tenho uma reserva' },
      { en: 'What time is checkout?', local: 'A que horas é o checkout?' },
      { en: 'Where is the bathroom?', local: 'Onde fica o banheiro?' },
    ],
  },
  Italian: {
    greetings: [
      { en: 'Hello', local: 'Ciao / Buongiorno' },
      { en: 'Thank you', local: 'Grazie mille' },
      { en: 'Excuse me', local: 'Mi scusi' },
      { en: 'Goodbye', local: 'Arrivederci' },
      { en: 'Yes / No', local: 'Sì / No' },
      { en: 'Please', local: 'Per favore' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'Posso vedere il menu?' },
      { en: 'I am vegetarian', local: 'Sono vegetariano/a' },
      { en: 'Water, please', local: 'Acqua, per favore' },
      { en: 'The bill, please', local: 'Il conto, per favore' },
      { en: 'This is delicious!', local: 'È delizioso!' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'Dov\'è la stazione?' },
      { en: 'How far is it?', local: 'Quanto è lontano?' },
      { en: 'Turn left / right', local: 'Gira a sinistra / destra' },
      { en: 'I am lost', local: 'Mi sono perso/a' },
    ],
    emergency: [
      { en: 'I need help!', local: 'Ho bisogno di aiuto!' },
      { en: 'Call an ambulance!', local: 'Chiama un\'ambulanza!' },
      { en: 'Call the police!', local: 'Chiama la polizia!' },
      { en: 'I don\'t feel well', local: 'Non mi sento bene' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'Ho una prenotazione' },
      { en: 'What time is checkout?', local: 'A che ora è il check-out?' },
      { en: 'Where is the bathroom?', local: 'Dov\'è il bagno?' },
    ],
  },
  Turkish: {
    greetings: [
      { en: 'Hello', local: 'Merhaba' },
      { en: 'Thank you', local: 'Teşekkür ederim' },
      { en: 'Excuse me', local: 'Pardon / Affedersiniz' },
      { en: 'Goodbye', local: 'Hoşça kalın' },
      { en: 'Yes / No', local: 'Evet / Hayır' },
      { en: 'Please', local: 'Lütfen' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'Menüyü görebilir miyim?' },
      { en: 'I am vegetarian', local: 'Ben vejeteryanım' },
      { en: 'Water, please', local: 'Su lütfen' },
      { en: 'The bill, please', local: 'Hesap lütfen' },
      { en: 'This is delicious!', local: 'Çok lezzetli!' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'Tren istasyonu nerede?' },
      { en: 'How far is it?', local: 'Ne kadar uzak?' },
      { en: 'Turn left / right', local: 'Sola / Sağa dönün' },
      { en: 'I am lost', local: 'Kayboldum' },
    ],
    emergency: [
      { en: 'I need help!', local: 'Yardıma ihtiyacım var!' },
      { en: 'Call an ambulance!', local: 'Bir ambulans çağırın!' },
      { en: 'Call the police!', local: 'Polis çağırın!' },
      { en: 'I don\'t feel well', local: 'İyi hissetmiyorum' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'Rezervasyonum var' },
      { en: 'What time is checkout?', local: 'Çıkış saati kaçta?' },
      { en: 'Where is the bathroom?', local: 'Banyo nerede?' },
    ],
  },
  Bengali: {
    greetings: [
      { en: 'Hello', local: 'নমস্কার (Nomoshkar)' },
      { en: 'Thank you', local: 'ধন্যবাদ (Dhonnobad)' },
      { en: 'Excuse me', local: 'মাফ করবেন (Maaf korben)' },
      { en: 'Goodbye', local: 'বিদায় (Biday)' },
      { en: 'Yes / No', local: 'হ্যাঁ / না (Hyan / Na)' },
      { en: 'Please', local: 'দয়া করে (Doya kore)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'মেনু দেখতে পারি? (Menu dekhte pari?)' },
      { en: 'I am vegetarian', local: 'আমি নিরামিষভোজী (Ami niramish bhoji)' },
      { en: 'Water, please', local: 'জল দিন (Jol din)' },
      { en: 'The bill, please', local: 'বিল দিন (Bill din)' },
      { en: 'This is delicious!', local: 'এটা খুব সুস্বাদু! (Eta khub sushwadu!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'ট্রেন স্টেশন কোথায়? (Train station kothay?)' },
      { en: 'How far is it?', local: 'কতদূর? (Koto dur?)' },
      { en: 'Turn left / right', local: 'বাঁ দিকে / ডান দিকে যান (Ba dike / Dan dike jan)' },
      { en: 'I am lost', local: 'আমি হারিয়ে গেছি (Ami hariye gechi)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'আমার সাহায্য দরকার! (Amar sahajjo dorkar!)' },
      { en: 'Call an ambulance!', local: 'অ্যাম্বুলেন্স ডাকুন! (Ambulance dakun!)' },
      { en: 'Call the police!', local: 'পুলিশ ডাকুন! (Police dakun!)' },
      { en: 'I don\'t feel well', local: 'আমার শরীর ভালো লাগছে না (Amar shorir bhalo lagche na)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'আমার রিজার্ভেশন আছে (Amar reservation ache)' },
      { en: 'What time is checkout?', local: 'চেকআউট কটায়? (Checkout kotay?)' },
      { en: 'Where is the bathroom?', local: 'বাথরুম কোথায়? (Bathroom kothay?)' },
    ],
  },
  Telugu: {
    greetings: [
      { en: 'Hello', local: 'నమస్కారం (Namaskaram)' },
      { en: 'Thank you', local: 'ధన్యవాదాలు (Dhanyavaadaalu)' },
      { en: 'Excuse me', local: 'క్షమించండి (Kshaminchandi)' },
      { en: 'Goodbye', local: 'వెళ్తాను (Veltaanu)' },
      { en: 'Yes / No', local: 'అవును / కాదు (Avunu / Kaadu)' },
      { en: 'Please', local: 'దయచేసి (Dayachesi)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'మెనూ చూడవచ్చా? (Menu chudavacchaa?)' },
      { en: 'I am vegetarian', local: 'నేను శాకాహారిని (Nenu shaakaaharini)' },
      { en: 'Water, please', local: 'నీళ్ళు ఇవ్వండి (Neellu ivvandi)' },
      { en: 'The bill, please', local: 'బిల్ ఇవ్వండి (Bill ivvandi)' },
      { en: 'This is delicious!', local: 'ఇది చాలా రుచిగా ఉంది! (Idi chaala ruchiga undhi!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'రైల్వే స్టేషన్ ఎక్కడ? (Railway station ekkada?)' },
      { en: 'How far is it?', local: 'ఎంత దూరం? (Entha dooram?)' },
      { en: 'Turn left / right', local: 'ఎడమ / కుడి వైపు తిరగండి (Edama / Kudi vaipu tiragandi)' },
      { en: 'I am lost', local: 'నేను దారి తప్పాను (Nenu daari tappaanu)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'నాకు సహాయం కావాలి! (Naaku sahayam kaavaali!)' },
      { en: 'Call an ambulance!', local: 'అంబులెన్స్ పిలవండి! (Ambulance pilavandi!)' },
      { en: 'Call the police!', local: 'పోలీసులను పిలవండి! (Polisulanu pilavandi!)' },
      { en: 'I don\'t feel well', local: 'నాకు ఒంట్లో బాగాలేదు (Naaku ontlo baagaaledu)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'నా దగ్గర రిజర్వేషన్ ఉంది (Naa daggara reservation undhi)' },
      { en: 'What time is checkout?', local: 'చెకౌట్ ఎప్పుడు? (Checkout eppudu?)' },
      { en: 'Where is the bathroom?', local: 'బాత్రూమ్ ఎక్కడ? (Bathroom ekkada?)' },
    ],
  },
  Tamil: {
    greetings: [
      { en: 'Hello', local: 'வணக்கம் (Vanakkam)' },
      { en: 'Thank you', local: 'நன்றி (Nandri)' },
      { en: 'Excuse me', local: 'மன்னிக்கவும் (Mannikkavum)' },
      { en: 'Goodbye', local: 'போய் வருகிறேன் (Poi varugiren)' },
      { en: 'Yes / No', local: 'ஆம் / இல்லை (Aam / Illai)' },
      { en: 'Please', local: 'தயவுசெய்து (Thayavuseidhu)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'மெனு பார்க்கலாமா? (Menu parkkalaama?)' },
      { en: 'I am vegetarian', local: 'நான் சைவம் (Naan saivam)' },
      { en: 'Water, please', local: 'தண்ணீர் வேண்டும் (Thanneer vendum)' },
      { en: 'The bill, please', local: 'பில் கொடுங்கள் (Bill kodungal)' },
      { en: 'This is delicious!', local: 'இது மிகவும் சுவையானது! (Idhu migavum suvaiyaanadhu!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'ரயில் நிலையம் எங்கே? (Rayil nilaiyam engae?)' },
      { en: 'How far is it?', local: 'எவ்வளவு தூரம்? (Evvalavu thooram?)' },
      { en: 'Turn left / right', local: 'இடது / வலது திரும்பு (Idadhu / Valadhu thirumbu)' },
      { en: 'I am lost', local: 'நான் வழி தவறிவிட்டேன் (Naan vazhi thavarivitteen)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'எனக்கு உதவி வேண்டும்! (Enakku udhavi vendum!)' },
      { en: 'Call an ambulance!', local: 'ஆம்புலன்ஸ் அழையுங்கள்! (Ambulance azhaiyungal!)' },
      { en: 'Call the police!', local: 'போலீசை அழையுங்கள்! (Polisai azhaiyungal!)' },
      { en: 'I don\'t feel well', local: 'எனக்கு உடம்பு சரியில்லை (Enakku udambu sariyillai)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'எனக்கு முன்பதிவு உள்ளது (Enakku munpadivu ulladhu)' },
      { en: 'What time is checkout?', local: 'செக்அவுட் எப்போது? (Checkout eppodhu?)' },
      { en: 'Where is the bathroom?', local: 'குளியலறை எங்கே? (Kuliyalarai engae?)' },
    ],
  },
  Thai: {
    greetings: [
      { en: 'Hello', local: 'สวัสดี (Sawadee)' },
      { en: 'Thank you', local: 'ขอบคุณ (Khob khun)' },
      { en: 'Excuse me', local: 'ขอโทษ (Kho thot)' },
      { en: 'Goodbye', local: 'ลาก่อน (La kon)' },
      { en: 'Yes / No', local: 'ใช่ / ไม่ (Chai / Mai)' },
      { en: 'Please', local: 'กรุณา (Karuna)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'ขอดูเมนูหน่อย (Kho doo menu noi)' },
      { en: 'I am vegetarian', local: 'ฉันเป็นมังสวิรัติ (Chan pen mang-sa-wi-rat)' },
      { en: 'Water, please', local: 'ขอน้ำ (Kho naam)' },
      { en: 'The bill, please', local: 'เก็บเงิน (Kep ngoen)' },
      { en: 'This is delicious!', local: 'อร่อยมาก! (Aroi mak!)' },
    ],
    navigation: [
      { en: 'Where is the train station?', local: 'สถานีรถไฟอยู่ที่ไหน (Sathani rot fai yoo thi nai)' },
      { en: 'How far is it?', local: 'ไกลแค่ไหน (Klai khae nai)' },
      { en: 'Turn left / right', local: 'เลี้ยวซ้าย / ขวา (Liao saai / khwa)' },
      { en: 'I am lost', local: 'ฉันหลงทาง (Chan long thang)' },
    ],
    emergency: [
      { en: 'I need help!', local: 'ช่วยด้วย! (Chuai duai!)' },
      { en: 'Call an ambulance!', local: 'เรียกรถพยาบาล! (Riak rot phayabaan!)' },
      { en: 'Call the police!', local: 'เรียกตำรวจ! (Riak tamruat!)' },
      { en: 'I don\'t feel well', local: 'ฉันไม่สบาย (Chan mai sabai)' },
    ],
    accommodation: [
      { en: 'I have a reservation', local: 'ฉันจองไว้แล้ว (Chan jong wai laew)' },
      { en: 'What time is checkout?', local: 'เช็คเอาท์กี่โมง (Check out kii mong)' },
      { en: 'Where is the bathroom?', local: 'ห้องน้ำอยู่ที่ไหน (Hong naam yoo thi nai)' },
    ],
  },
};

// Mock GPS → Country → Languages mapping
const gpsMapping = {
  // Approx lat/long ranges
  regions: [
    { name: 'India', lat: [8, 35], lng: [68, 97], languages: ['Hindi', 'English', 'Telugu', 'Tamil', 'Bengali'], flag: '🇮🇳' },
    { name: 'Japan', lat: [24, 46], lng: [123, 146], languages: ['Japanese'], flag: '🇯🇵' },
    { name: 'France', lat: [42, 51], lng: [-5, 8], languages: ['French'], flag: '🇫🇷' },
    { name: 'UAE', lat: [22, 26], lng: [51, 56], languages: ['Arabic', 'English'], flag: '🇦🇪' },
    { name: 'Spain', lat: [36, 44], lng: [-9, 3], languages: ['Spanish'], flag: '🇪🇸' },
    { name: 'Germany', lat: [47, 55], lng: [6, 15], languages: ['German'], flag: '🇩🇪' },
    { name: 'China', lat: [18, 53], lng: [73, 135], languages: ['Chinese'], flag: '🇨🇳' },
    { name: 'South Korea', lat: [33, 39], lng: [125, 130], languages: ['Korean'], flag: '🇰🇷' },
    { name: 'Italy', lat: [36, 47], lng: [6, 18], languages: ['Italian'], flag: '🇮🇹' },
    { name: 'Turkey', lat: [36, 42], lng: [26, 45], languages: ['Turkish'], flag: '🇹🇷' },
    { name: 'Russia', lat: [41, 82], lng: [19, 180], languages: ['Russian'], flag: '🇷🇺' },
    { name: 'Brazil', lat: [-33, 5], lng: [-74, -34], languages: ['Portuguese'], flag: '🇧🇷' },
    { name: 'Thailand', lat: [5, 21], lng: [97, 106], languages: ['Thai'], flag: '🇹🇭' },
    { name: 'United States', lat: [25, 49], lng: [-125, -66], languages: ['English', 'Spanish'], flag: '🇺🇸' },
    { name: 'United Kingdom', lat: [49, 61], lng: [-8, 2], languages: ['English'], flag: '🇬🇧' },
  ],
  getRegion: function(lat, lng) {
    for (const region of this.regions) {
      if (lat >= region.lat[0] && lat <= region.lat[1] &&
          lng >= region.lng[0] && lng <= region.lng[1]) {
        return region;
      }
    }
    return { name: 'Unknown', languages: ['English'], flag: '🌍' };
  }
};

// Mock quick translation function
const mockTranslate = (text, targetLang) => {
  const lower = text.toLowerCase().trim();
  
  // Search phrase cards for matching text
  const langData = translationDB[targetLang];
  if (langData) {
    for (const category of Object.values(langData)) {
      for (const phrase of category) {
        if (phrase.en.toLowerCase() === lower) {
          return phrase.local;
        }
      }
    }
  }
  
  // Simple word-level mock translations
  const wordMap = {
    Hindi: { hello: 'नमस्ते', thanks: 'धन्यवाद', yes: 'हाँ', no: 'नहीं', help: 'मदद', water: 'पानी', food: 'खाना', stop: 'रुको', go: 'जाओ', where: 'कहाँ', how: 'कैसे', good: 'अच्छा', bad: 'बुरा' },
    Japanese: { hello: 'こんにちは', thanks: 'ありがとう', yes: 'はい', no: 'いいえ', help: '助けて', water: '水', food: '食べ物', stop: '止まれ', go: '行く', where: 'どこ', how: 'どう', good: '良い', bad: '悪い' },
    French: { hello: 'Bonjour', thanks: 'Merci', yes: 'Oui', no: 'Non', help: 'Aide', water: 'Eau', food: 'Nourriture', stop: 'Arrêtez', go: 'Allez', where: 'Où', how: 'Comment', good: 'Bon', bad: 'Mauvais' },
    Spanish: { hello: 'Hola', thanks: 'Gracias', yes: 'Sí', no: 'No', help: 'Ayuda', water: 'Agua', food: 'Comida', stop: 'Pare', go: 'Vaya', where: 'Dónde', how: 'Cómo', good: 'Bueno', bad: 'Malo' },
    German: { hello: 'Hallo', thanks: 'Danke', yes: 'Ja', no: 'Nein', help: 'Hilfe', water: 'Wasser', food: 'Essen', stop: 'Halt', go: 'Geh', where: 'Wo', how: 'Wie', good: 'Gut', bad: 'Schlecht' },
    Arabic: { hello: 'مرحبا', thanks: 'شكرا', yes: 'نعم', no: 'لا', help: 'مساعدة', water: 'ماء', food: 'طعام' },
    Chinese: { hello: '你好', thanks: '谢谢', yes: '是', no: '不是', help: '帮助', water: '水', food: '食物' },
    Korean: { hello: '안녕하세요', thanks: '감사합니다', yes: '네', no: '아니요', help: '도움', water: '물', food: '음식' },
    Russian: { hello: 'Здравствуйте', thanks: 'Спасибо', yes: 'Да', no: 'Нет', help: 'Помощь', water: 'Вода', food: 'Еда' },
    Portuguese: { hello: 'Olá', thanks: 'Obrigado', yes: 'Sim', no: 'Não', help: 'Ajuda', water: 'Água', food: 'Comida' },
    Italian: { hello: 'Ciao', thanks: 'Grazie', yes: 'Sì', no: 'No', help: 'Aiuto', water: 'Acqua', food: 'Cibo' },
    Turkish: { hello: 'Merhaba', thanks: 'Teşekkürler', yes: 'Evet', no: 'Hayır', help: 'Yardım', water: 'Su', food: 'Yemek' },
    Bengali: { hello: 'নমস্কার', thanks: 'ধন্যবাদ', yes: 'হ্যাঁ', no: 'না', help: 'সাহায্য', water: 'জল', food: 'খাবার' },
    Telugu: { hello: 'నమస్కారం', thanks: 'ధన్యవాదాలు', yes: 'అవును', no: 'కాదు', help: 'సహాయం', water: 'నీళ్ళు', food: 'ఆహారం' },
    Tamil: { hello: 'வணக்கம்', thanks: 'நன்றி', yes: 'ஆம்', no: 'இல்லை', help: 'உதவி', water: 'தண்ணீர்', food: 'உணவு' },
    Thai: { hello: 'สวัสดี', thanks: 'ขอบคุณ', yes: 'ใช่', no: 'ไม่', help: 'ช่วยด้วย', water: 'น้ำ', food: 'อาหาร' },
  };

  const map = wordMap[targetLang];
  if (map) {
    const words = lower.split(/\s+/);
    const translated = words.map(w => map[w] || w).join(' ');
    if (translated !== lower) return translated;
  }

  return `[${targetLang}] ${text}`;
};

function Translator() {
  const [inputText, setInputText] = useState('');
  const [fromLang, setFromLang] = useState('English');
  const [toLang, setToLang] = useState('Hindi');
  const [translated, setTranslated] = useState('');
  const [copied, setCopied] = useState(null);
  const [activeCategory, setActiveCategory] = useState('greetings');
  const [isTranslating, setIsTranslating] = useState(false);

  // GPS Location State
  const [location, setLocation] = useState({
    detecting: false,
    detected: false,
    country: null,
    languages: [],
    flag: '🌍',
    coords: null,
    error: null,
  });

  const allLanguages = [
    'English', 'Hindi', 'Spanish', 'French', 'German', 'Arabic',
    'Chinese', 'Japanese', 'Korean', 'Russian', 'Portuguese',
    'Italian', 'Turkish', 'Bengali', 'Telugu', 'Tamil', 'Thai',
  ];

  const categories = [
    { key: 'greetings', label: 'Greetings', icon: Heart },
    { key: 'food', label: 'Food & Dining', icon: Utensils },
    { key: 'navigation', label: 'Navigation', icon: Navigation },
    { key: 'emergency', label: 'Emergency', icon: Shield },
    { key: 'accommodation', label: 'Accommodation', icon: Hotel },
  ];

  // Detect GPS location
  const detectLocation = useCallback(() => {
    setLocation(prev => ({ ...prev, detecting: true, error: null }));

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const region = gpsMapping.getRegion(latitude, longitude);
          
          setLocation({
            detecting: false,
            detected: true,
            country: region.name,
            languages: region.languages,
            flag: region.flag,
            coords: { lat: latitude.toFixed(4), lng: longitude.toFixed(4) },
            error: null,
          });

          // Auto-set target language to first detected language (skip English if possible)
          const preferredLang = region.languages.find(l => l !== 'English') || region.languages[0];
          if (preferredLang && translationDB[preferredLang]) {
            setToLang(preferredLang);
          }
        },
        (error) => {
          // Fallback: simulate a location for demo
          const mockRegions = gpsMapping.regions;
          const randomRegion = mockRegions[Math.floor(Math.random() * mockRegions.length)];
          
          setLocation({
            detecting: false,
            detected: true,
            country: randomRegion.name,
            languages: randomRegion.languages,
            flag: randomRegion.flag,
            coords: {
              lat: ((randomRegion.lat[0] + randomRegion.lat[1]) / 2).toFixed(4),
              lng: ((randomRegion.lng[0] + randomRegion.lng[1]) / 2).toFixed(4),
            },
            error: 'GPS unavailable — showing simulated location',
          });

          const preferredLang = randomRegion.languages.find(l => l !== 'English') || randomRegion.languages[0];
          if (preferredLang && translationDB[preferredLang]) {
            setToLang(preferredLang);
          }
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    } else {
      // No geolocation: simulate India
      setLocation({
        detecting: false,
        detected: true,
        country: 'India',
        languages: ['Hindi', 'English', 'Telugu', 'Tamil', 'Bengali'],
        flag: '🇮🇳',
        coords: { lat: '20.5937', lng: '78.9629' },
        error: 'Geolocation not supported — showing simulated location',
      });
      setToLang('Hindi');
    }
  }, []);

  // Auto-detect on mount
  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    setIsTranslating(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    const result = mockTranslate(inputText, toLang);
    setTranslated(result);
    setIsTranslating(false);
  };

  // Live translation as user types (debounced)
  useEffect(() => {
    if (!inputText.trim()) {
      setTranslated('');
      return;
    }
    const timer = setTimeout(() => {
      const result = mockTranslate(inputText, toLang);
      setTranslated(result);
    }, 400);
    return () => clearTimeout(timer);
  }, [inputText, toLang]);

  const handleCopy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const swapLanguages = () => {
    if (toLang !== 'English' && fromLang === 'English') {
      setFromLang(toLang);
      setToLang('English');
    } else {
      setFromLang('English');
      setToLang(fromLang === 'English' ? 'Hindi' : fromLang);
    }
    setInputText('');
    setTranslated('');
  };

  const currentPhrases = translationDB[toLang]?.[activeCategory] || translationDB['Hindi']?.[activeCategory] || [];

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Languages}
          title="Smart Translator"
          subtitle="GPS-powered multilingual translation with context-aware phrases."
        />

        {/* Location Bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card p-4 sm:p-5 mb-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
                {location.detecting ? (
                  <Loader className="w-5 h-5 text-accent-primary animate-spin" />
                ) : (
                  <span className="text-lg">{location.flag}</span>
                )}
              </div>
              <div>
                {location.detecting ? (
                  <p className="text-sm text-text-secondary">Detecting your location...</p>
                ) : location.detected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">{location.country}</p>
                      {location.coords && (
                        <span className="text-xs text-text-muted">
                          ({location.coords.lat}, {location.coords.lng})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {location.languages.map((lang) => (
                        <button
                          key={lang}
                          onClick={() => {
                            if (lang !== 'English') setToLang(lang);
                          }}
                          className={`text-xs px-2 py-0.5 rounded-full transition-all ${
                            toLang === lang
                              ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                              : 'bg-white/5 text-text-muted hover:text-text-secondary hover:bg-white/10'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-text-muted">Location not detected</p>
                )}
              </div>
            </div>
            <button
              onClick={detectLocation}
              disabled={location.detecting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-all disabled:opacity-50 shrink-0"
            >
              <MapPin className="w-4 h-4" />
              {location.detecting ? 'Detecting...' : 'Refresh Location'}
            </button>
          </div>
          {location.error && (
            <div className="flex items-center gap-2 mt-3 text-xs text-amber-400/80">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {location.error}
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Translator */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-6"
          >
            <div className="glass-card p-6">
              <h3 className="text-base font-semibold text-text-primary mb-5 flex items-center gap-2">
                <Globe className="w-5 h-5 text-accent-primary" />
                Live Translator
              </h3>

              {/* Language Selectors */}
              <div className="flex items-center gap-3 mb-5">
                <select
                  value={fromLang}
                  onChange={(e) => setFromLang(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all appearance-none"
                >
                  {allLanguages.map(l => <option key={l} value={l} className="bg-bg-card">{l}</option>)}
                </select>
                <button
                  onClick={swapLanguages}
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-border-subtle hover:bg-white/[0.08] transition-colors shrink-0"
                  title="Swap languages"
                >
                  <ArrowLeftRight className="w-4 h-4 text-accent-primary" />
                </button>
                <select
                  value={toLang}
                  onChange={(e) => setToLang(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all appearance-none"
                >
                  {allLanguages.map(l => <option key={l} value={l} className="bg-bg-card">{l}</option>)}
                </select>
              </div>

              {/* Input */}
              <div className="relative mb-4">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Type in ${fromLang}...`}
                  rows={4}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/40 transition-all resize-none"
                />
                {inputText && (
                  <button
                    onClick={() => { setInputText(''); setTranslated(''); }}
                    className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                )}
              </div>

              {/* Translate Button */}
              <button
                onClick={handleTranslate}
                disabled={!inputText.trim() || isTranslating}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTranslating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-bg-primary border-t-transparent rounded-full animate-spin" />
                    Translating...
                  </>
                ) : (
                  <>
                    <Languages className="w-4 h-4" />
                    Translate to {toLang}
                  </>
                )}
              </button>

              {/* Translation Output */}
              <AnimatePresence>
                {translated && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="mt-5 p-4 rounded-xl bg-accent-primary/5 border border-accent-primary/10"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-accent-primary/70">{toLang}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Listen">
                          <Volume2 className="w-4 h-4 text-text-muted" />
                        </button>
                        <button
                          onClick={() => handleCopy(translated, 'main')}
                          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                          title="Copy"
                        >
                          {copied === 'main' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-text-muted" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-base text-accent-primary font-medium leading-relaxed">{translated}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Phrases for detected languages */}
            {location.detected && location.languages.length > 1 && (
              <div className="glass-card p-5">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Quick Switch — Local Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {location.languages.filter(l => translationDB[l]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setToLang(lang)}
                      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                        toLang === lang
                          ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                          : 'bg-white/[0.04] text-text-secondary border border-border-subtle hover:bg-white/[0.06]'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Context Phrases */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-6"
          >
            <h3 className="text-base font-semibold text-text-primary mb-1 flex items-center gap-2">
              <Search className="w-5 h-5 text-accent-primary" />
              Context-Aware Phrases
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Showing phrases in {toLang} {location.country ? `for ${location.country}` : ''}
            </p>
            
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2 mb-5">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeCategory === cat.key
                      ? 'bg-accent-primary/15 text-accent-primary'
                      : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.06]'
                  }`}
                >
                  <cat.icon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Phrase Cards */}
            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${toLang}-${activeCategory}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-2.5"
                >
                  {currentPhrases.length > 0 ? (
                    currentPhrases.map((phrase, i) => {
                      const phraseId = `${toLang}-${activeCategory}-${i}`;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.04 }}
                          className="p-3.5 rounded-xl bg-white/[0.02] border border-border-subtle hover:bg-white/[0.04] transition-colors group"
                        >
                          <p className="text-sm text-text-primary mb-1.5">{phrase.en}</p>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-accent-primary/90 leading-relaxed flex-1">{phrase.local}</p>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button className="p-1 rounded hover:bg-white/5" title="Listen">
                                <Volume2 className="w-3.5 h-3.5 text-text-muted" />
                              </button>
                              <button
                                onClick={() => handleCopy(phrase.local, phraseId)}
                                className="p-1 rounded hover:bg-white/5"
                                title="Copy"
                              >
                                {copied === phraseId ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-text-muted" />
                                )}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8">
                      <Languages className="w-8 h-8 text-text-muted mx-auto mb-3" />
                      <p className="text-sm text-text-secondary">
                        Phrases not available for {toLang} in this category.
                      </p>
                      <p className="text-xs text-text-muted mt-1">Try selecting a different language or category.</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default Translator;