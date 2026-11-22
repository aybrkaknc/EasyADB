use std::collections::HashMap;

pub fn get_seed_data() -> HashMap<String, String> {
    let mut m = HashMap::new();

    // ---------------------------------------------------------------------
    // GOOGLE APPS & SERVICES
    // ---------------------------------------------------------------------
    m.insert(
        "com.android.vending".to_string(),
        "Google Play Store".to_string(),
    );
    m.insert(
        "com.google.android.gms".to_string(),
        "Google Play Services".to_string(),
    );
    m.insert(
        "com.google.android.gsf".to_string(),
        "Google Services Framework".to_string(),
    );
    m.insert(
        "com.google.android.webview".to_string(),
        "Android System WebView".to_string(),
    );
    m.insert(
        "com.google.android.packageinstaller".to_string(),
        "Package Installer".to_string(),
    );
    m.insert(
        "com.google.android.permissioncontroller".to_string(),
        "Permission Controller".to_string(),
    );
    m.insert(
        "com.android.chrome".to_string(),
        "Google Chrome".to_string(),
    );
    m.insert(
        "com.google.android.youtube".to_string(),
        "YouTube".to_string(),
    );
    m.insert("com.google.android.gm".to_string(), "Gmail".to_string());
    m.insert(
        "com.google.android.apps.maps".to_string(),
        "Google Maps".to_string(),
    );
    m.insert(
        "com.google.android.apps.photos".to_string(),
        "Google Photos".to_string(),
    );
    m.insert(
        "com.google.android.apps.docs".to_string(),
        "Google Drive".to_string(),
    );
    m.insert(
        "com.google.android.keep".to_string(),
        "Google Keep".to_string(),
    );
    m.insert(
        "com.google.android.calendar".to_string(),
        "Google Calendar".to_string(),
    );
    m.insert(
        "com.google.android.deskclock".to_string(),
        "Clock".to_string(),
    );
    m.insert(
        "com.google.android.calculator".to_string(),
        "Calculator".to_string(),
    );
    m.insert(
        "com.google.android.contacts".to_string(),
        "Contacts".to_string(),
    );
    m.insert("com.google.android.dialer".to_string(), "Phone".to_string());
    m.insert(
        "com.google.android.apps.messaging".to_string(),
        "Messages".to_string(),
    );
    m.insert(
        "com.google.android.inputmethod.latin".to_string(),
        "Gboard".to_string(),
    );
    m.insert(
        "com.google.android.apps.googleassistant".to_string(),
        "Google Assistant".to_string(),
    );
    m.insert(
        "com.google.android.googlequicksearchbox".to_string(),
        "Google App".to_string(),
    );
    m.insert(
        "com.google.android.apps.walletnfcrel".to_string(),
        "Google Wallet".to_string(),
    );
    m.insert(
        "com.google.android.apps.tachyon".to_string(),
        "Google Meet".to_string(),
    );
    m.insert(
        "com.google.android.music".to_string(),
        "Google Play Music".to_string(),
    );
    m.insert(
        "com.google.android.videos".to_string(),
        "Google TV".to_string(),
    );
    m.insert(
        "com.google.android.apps.books".to_string(),
        "Google Play Books".to_string(),
    );
    m.insert(
        "com.google.android.apps.magazines".to_string(),
        "Google News".to_string(),
    );
    m.insert("com.google.earth".to_string(), "Google Earth".to_string());
    m.insert(
        "com.google.android.apps.translate".to_string(),
        "Google Translate".to_string(),
    );
    m.insert(
        "com.google.android.apps.fitness".to_string(),
        "Google Fit".to_string(),
    );
    m.insert(
        "com.google.android.apps.podcasts".to_string(),
        "Google Podcasts".to_string(),
    );
    m.insert(
        "com.google.android.apps.wellbeing".to_string(),
        "Digital Wellbeing".to_string(),
    );
    m.insert(
        "com.google.android.projection.gearhead".to_string(),
        "Android Auto".to_string(),
    );
    m.insert(
        "com.google.ar.core".to_string(),
        "Google Play Services for AR".to_string(),
    );
    m.insert(
        "com.google.android.apps.nbu.files".to_string(),
        "Files by Google".to_string(),
    );
    m.insert(
        "com.google.android.apps.youtube.music".to_string(),
        "YouTube Music".to_string(),
    );
    m.insert(
        "com.google.android.apps.youtube.kids".to_string(),
        "YouTube Kids".to_string(),
    );
    m.insert(
        "com.google.android.apps.youtube.creator".to_string(),
        "YouTube Studio".to_string(),
    );

    // ---------------------------------------------------------------------
    // SAMSUNG (ONE UI) SYSTEM APPS
    // ---------------------------------------------------------------------
    m.insert(
        "com.sec.android.app.launcher".to_string(),
        "Samsung One UI Home".to_string(),
    );
    m.insert(
        "com.samsung.android.incallui".to_string(),
        "Samsung InCallUI".to_string(),
    );
    m.insert(
        "com.samsung.android.dialer".to_string(),
        "Samsung Phone".to_string(),
    );
    m.insert(
        "com.samsung.android.messaging".to_string(),
        "Samsung Messages".to_string(),
    );
    m.insert(
        "com.sec.android.app.camera".to_string(),
        "Samsung Camera".to_string(),
    );
    m.insert(
        "com.sec.android.gallery3d".to_string(),
        "Samsung Gallery".to_string(),
    );
    m.insert(
        "com.sec.android.app.myfiles".to_string(),
        "Samsung My Files".to_string(),
    );
    m.insert(
        "com.samsung.android.calendar".to_string(),
        "Samsung Calendar".to_string(),
    );
    m.insert(
        "com.sec.android.app.clockpackage".to_string(),
        "Samsung Clock".to_string(),
    );
    m.insert(
        "com.sec.android.app.popupcalculator".to_string(),
        "Samsung Calculator".to_string(),
    );
    m.insert(
        "com.samsung.android.app.notes".to_string(),
        "Samsung Notes".to_string(),
    );
    m.insert(
        "com.samsung.android.app.reminder".to_string(),
        "Samsung Reminder".to_string(),
    );
    m.insert(
        "com.sec.android.app.voicenote".to_string(),
        "Samsung Voice Recorder".to_string(),
    );
    m.insert(
        "com.samsung.android.email.provider".to_string(),
        "Samsung Email".to_string(),
    );
    m.insert(
        "com.samsung.android.app.contacts".to_string(),
        "Samsung Contacts".to_string(),
    );
    m.insert(
        "com.samsung.android.lool".to_string(),
        "Samsung Device Care".to_string(),
    );
    m.insert(
        "com.samsung.android.app.smartswitch".to_string(),
        "Samsung Smart Switch".to_string(),
    );
    m.insert(
        "com.samsung.android.oneconnect".to_string(),
        "Samsung SmartThings".to_string(),
    );
    m.insert(
        "com.samsung.android.app.watchmanager".to_string(),
        "Galaxy Wearable".to_string(),
    );
    m.insert(
        "com.samsung.android.samsungpass".to_string(),
        "Samsung Pass".to_string(),
    );
    m.insert(
        "com.samsung.android.samsungpassautofill".to_string(),
        "Samsung Pass Autofill".to_string(),
    );
    m.insert(
        "com.samsung.android.authframework".to_string(),
        "Samsung Auth Framework".to_string(),
    );
    m.insert(
        "com.samsung.android.spay".to_string(),
        "Samsung Pay".to_string(),
    );
    m.insert(
        "com.samsung.android.scloud".to_string(),
        "Samsung Cloud".to_string(),
    );
    m.insert(
        "com.samsung.android.themestore".to_string(),
        "Galaxy Themes".to_string(),
    );
    m.insert(
        "com.sec.android.app.samsungapps".to_string(),
        "Galaxy Store".to_string(),
    );
    m.insert(
        "com.samsung.android.game.gamehome".to_string(),
        "Samsung Game Launcher".to_string(),
    );
    m.insert(
        "com.samsung.android.game.gametools".to_string(),
        "Samsung Game Tools".to_string(),
    );
    m.insert(
        "com.samsung.android.game.gos".to_string(),
        "Game Optimizing Service".to_string(),
    );
    m.insert(
        "com.sec.android.app.shealth".to_string(),
        "Samsung Health".to_string(),
    );
    m.insert(
        "com.samsung.android.bixby.agent".to_string(),
        "Bixby Voice".to_string(),
    );
    m.insert(
        "com.samsung.android.bixby.service".to_string(),
        "Bixby Service".to_string(),
    );
    m.insert(
        "com.samsung.android.app.settings.bixby".to_string(),
        "Bixby Settings".to_string(),
    );
    m.insert(
        "com.samsung.android.visionintelligence".to_string(),
        "Bixby Vision".to_string(),
    );
    m.insert(
        "com.samsung.android.arzone".to_string(),
        "AR Zone".to_string(),
    );
    m.insert(
        "com.samsung.android.app.tips".to_string(),
        "Samsung Tips".to_string(),
    );
    m.insert(
        "com.sec.android.daemonapp".to_string(),
        "Samsung Weather".to_string(),
    );
    m.insert(
        "com.samsung.android.app.cocktailbarservice".to_string(),
        "Edge Panels".to_string(),
    );
    m.insert(
        "com.samsung.android.app.taskedge".to_string(),
        "Tasks Edge".to_string(),
    );
    m.insert(
        "com.samsung.android.app.appsedge".to_string(),
        "Apps Edge".to_string(),
    );
    m.insert(
        "com.samsung.android.app.clipboardedge".to_string(),
        "Clipboard Edge".to_string(),
    );
    m.insert(
        "com.samsung.android.service.peoplestripe".to_string(),
        "People Edge".to_string(),
    );
    m.insert(
        "com.samsung.android.app.simplesharing".to_string(),
        "Link Sharing".to_string(),
    );
    m.insert(
        "com.samsung.knox.securefolder".to_string(),
        "Secure Folder".to_string(),
    );
    m.insert(
        "com.samsung.android.kgclient".to_string(),
        "Knox Guard".to_string(),
    );
    m.insert(
        "com.sec.enterprise.knox.attestation".to_string(),
        "Knox Attestation".to_string(),
    );
    m.insert(
        "com.samsung.klmsagent".to_string(),
        "Knox License Agent".to_string(),
    );
    m.insert(
        "com.samsung.android.kids installer".to_string(),
        "Samsung Kids".to_string(),
    );

    // ---------------------------------------------------------------------
    // XIAOMI (MIUI / HYPEROS) SYSTEM APPS
    // ---------------------------------------------------------------------
    m.insert(
        "com.miui.home".to_string(),
        "POCO Launcher / MIUI Home".to_string(),
    );
    m.insert(
        "com.miui.securitycenter".to_string(),
        "MIUI Security".to_string(),
    );
    m.insert(
        "com.miui.cleanmaster".to_string(),
        "MIUI Cleaner".to_string(),
    );
    m.insert("com.miui.gallery".to_string(), "MIUI Gallery".to_string());
    m.insert("com.miui.player".to_string(), "MIUI Music".to_string());
    m.insert("com.miui.videoplayer".to_string(), "MIUI Video".to_string());
    m.insert("com.miui.notes".to_string(), "Xiaomi Notes".to_string());
    m.insert(
        "com.miui.weather2".to_string(),
        "Xiaomi Weather".to_string(),
    );
    m.insert(
        "com.miui.calculator".to_string(),
        "Xiaomi Calculator".to_string(),
    );
    m.insert(
        "com.android.fileexplorer".to_string(),
        "Xiaomi File Manager".to_string(),
    );
    m.insert("com.miui.compass".to_string(), "Compass".to_string());
    m.insert(
        "com.miui.screenrecorder".to_string(),
        "Screen Recorder".to_string(),
    );
    m.insert("com.miui.huanji".to_string(), "Mi Mover".to_string());
    m.insert("com.xiaomi.midrop".to_string(), "ShareMe".to_string());
    m.insert(
        "com.xiaomi.mipicks".to_string(),
        "GetApps (Mi App Store)".to_string(),
    );
    m.insert(
        "com.miui.cloudservice".to_string(),
        "Xiaomi Cloud".to_string(),
    );
    m.insert(
        "com.miui.cloudbackup".to_string(),
        "Xiaomi Cloud Backup".to_string(),
    );
    m.insert(
        "com.miui.micloudsync".to_string(),
        "Xiaomi Cloud Sync".to_string(),
    );
    m.insert(
        "com.xiaomi.account".to_string(),
        "Xiaomi Account".to_string(),
    );
    m.insert("com.miui.hybrid".to_string(), "Quick Apps".to_string());
    m.insert(
        "com.miui.analytics".to_string(),
        "MIUI Analytics".to_string(),
    );
    m.insert(
        "com.miui.msa.global".to_string(),
        "MSA (MIUI Ad Services)".to_string(),
    );
    m.insert(
        "com.miui.system".to_string(),
        "MIUI System Components".to_string(),
    );
    m.insert("com.miui.rom".to_string(), "MIUI ROM".to_string());
    m.insert("com.xiaomi.scanner".to_string(), "Scanner".to_string());
    m.insert(
        "com.mi.android.globalminlus".to_string(),
        "Mi Browser".to_string(),
    );
    m.insert("com.miui.daemon".to_string(), "MIUI Daemon".to_string());
    m.insert(
        "com.miui.powerkeeper".to_string(),
        "Battery Saver".to_string(),
    );
    m.insert(
        "com.miui.guardprovider".to_string(),
        "Guard Provider".to_string(),
    );

    // ---------------------------------------------------------------------
    // SOCIAL MEDIA
    // ---------------------------------------------------------------------
    m.insert("com.facebook.katana".to_string(), "Facebook".to_string());
    m.insert("com.facebook.orca".to_string(), "Messenger".to_string());
    m.insert("com.facebook.lite".to_string(), "Facebook Lite".to_string());
    m.insert(
        "com.facebook.mlite".to_string(),
        "Messenger Lite".to_string(),
    );
    m.insert("com.instagram.android".to_string(), "Instagram".to_string());
    m.insert("com.whatsapp".to_string(), "WhatsApp".to_string());
    m.insert(
        "com.whatsapp.w4b".to_string(),
        "WhatsApp Business".to_string(),
    );
    m.insert("com.twitter.android".to_string(), "X (Twitter)".to_string());
    m.insert("com.zhiliaoapp.musically".to_string(), "TikTok".to_string());
    m.insert(
        "com.ss.android.ugc.trill".to_string(),
        "TikTok (Asia)".to_string(),
    );
    m.insert("com.snapchat.android".to_string(), "Snapchat".to_string());
    m.insert("com.linkedin.android".to_string(), "LinkedIn".to_string());
    m.insert("com.pinterest".to_string(), "Pinterest".to_string());
    m.insert("com.reddit.frontpage".to_string(), "Reddit".to_string());
    m.insert("com.discord".to_string(), "Discord".to_string());
    m.insert("org.telegram.messenger".to_string(), "Telegram".to_string());
    m.insert(
        "org.telegram.plus".to_string(),
        "Plus Messenger".to_string(),
    );
    m.insert("com.viber.voip".to_string(), "Viber".to_string());
    m.insert("jp.naver.line.android".to_string(), "LINE".to_string());
    m.insert("com.tencent.mm".to_string(), "WeChat".to_string());
    m.insert("com.skype.raider".to_string(), "Skype".to_string());
    m.insert(
        "com.microsoft.teams".to_string(),
        "Microsoft Teams".to_string(),
    );
    m.insert("com.zoom.videomeetings".to_string(), "Zoom".to_string());
    m.insert("com.tumblr".to_string(), "Tumblr".to_string());
    m.insert("com.twitch.android.app".to_string(), "Twitch".to_string());
    m.insert("tv.twitch.android.app".to_string(), "Twitch".to_string());

    // ---------------------------------------------------------------------
    // MUSIC & AUDIO
    // ---------------------------------------------------------------------
    m.insert("com.spotify.music".to_string(), "Spotify".to_string());
    m.insert(
        "com.apple.android.music".to_string(),
        "Apple Music".to_string(),
    );
    m.insert("deezer.android.app".to_string(), "Deezer".to_string());
    m.insert(
        "com.soundcloud.android".to_string(),
        "SoundCloud".to_string(),
    );
    m.insert("com.tidal.prod".to_string(), "Tidal".to_string());
    m.insert("com.amazon.mp3".to_string(), "Amazon Music".to_string());
    m.insert(
        "com.google.android.apps.youtube.music".to_string(),
        "YouTube Music".to_string(),
    );
    m.insert(
        "com.maxmpz.audioplayer".to_string(),
        "Poweramp Music Player".to_string(),
    );
    m.insert(
        "com.maxmpz.audioplayer.unlock".to_string(),
        "Poweramp Full Version Unlocker".to_string(),
    );
    m.insert(
        "com.musixmatch.android.lyrify".to_string(),
        "Musixmatch".to_string(),
    );
    m.insert("com.shazam.android".to_string(), "Shazam".to_string());
    m.insert("com.mixcloud.player".to_string(), "Mixcloud".to_string());
    m.insert("fm.player".to_string(), "Player FM".to_string());
    m.insert("tunein.player".to_string(), "TuneIn Radio".to_string());

    // ---------------------------------------------------------------------
    // VIDEO & STREAMING
    // ---------------------------------------------------------------------
    m.insert("com.netflix.mediaclient".to_string(), "Netflix".to_string());
    m.insert(
        "com.amazon.avod.thirdpartyclient".to_string(),
        "Amazon Prime Video".to_string(),
    );
    m.insert("com.disney.disneyplus".to_string(), "Disney+".to_string());
    m.insert("com.hbo.hbonow".to_string(), "HBO Max".to_string());
    m.insert("com.hulu.plus".to_string(), "Hulu".to_string());
    m.insert("tv.pluto.android".to_string(), "Pluto TV".to_string());
    m.insert("com.tubitv".to_string(), "Tubi".to_string());
    m.insert("com.roku.remote".to_string(), "Roku".to_string());
    m.insert(
        "com.mxtech.videoplayer.ad".to_string(),
        "MX Player".to_string(),
    );
    m.insert(
        "com.mxtech.videoplayer.pro".to_string(),
        "MX Player Pro".to_string(),
    );
    m.insert(
        "org.videolan.vlc".to_string(),
        "VLC for Android".to_string(),
    );
    m.insert("com.plexapp.android".to_string(), "Plex".to_string());
    m.insert("com.kodi".to_string(), "Kodi".to_string());

    // ---------------------------------------------------------------------
    // PRODUCTIVITY & UTILITIES
    // ---------------------------------------------------------------------
    m.insert(
        "com.microsoft.office.word".to_string(),
        "Microsoft Word".to_string(),
    );
    m.insert(
        "com.microsoft.office.excel".to_string(),
        "Microsoft Excel".to_string(),
    );
    m.insert(
        "com.microsoft.office.powerpoint".to_string(),
        "Microsoft PowerPoint".to_string(),
    );
    m.insert(
        "com.microsoft.office.officehubrow".to_string(),
        "Microsoft 365 (Office)".to_string(),
    );
    m.insert(
        "com.microsoft.office.onenote".to_string(),
        "Microsoft OneNote".to_string(),
    );
    m.insert(
        "com.microsoft.skydrive".to_string(),
        "Microsoft OneDrive".to_string(),
    );
    m.insert(
        "com.microsoft.outlook".to_string(),
        "Microsoft Outlook".to_string(),
    );
    m.insert(
        "com.adobe.reader".to_string(),
        "Adobe Acrobat Reader".to_string(),
    );
    m.insert(
        "com.adobe.scan.android".to_string(),
        "Adobe Scan".to_string(),
    );
    m.insert(
        "com.adobe.lrmobile".to_string(),
        "Adobe Lightroom".to_string(),
    );
    m.insert(
        "com.adobe.psmobile".to_string(),
        "Adobe Photoshop Express".to_string(),
    );
    m.insert(
        "com.intsig.camscanner".to_string(),
        "CamScanner".to_string(),
    );
    m.insert("com.evernote".to_string(), "Evernote".to_string());
    m.insert("com.dropbox.android".to_string(), "Dropbox".to_string());
    m.insert("com.box.android".to_string(), "Box".to_string());
    m.insert("com.slack".to_string(), "Slack".to_string());
    m.insert("com.trello".to_string(), "Trello".to_string());
    m.insert("com.asana.app".to_string(), "Asana".to_string());
    m.insert("com.todoist".to_string(), "Todoist".to_string());
    m.insert("com.ticktick.task".to_string(), "TickTick".to_string());
    m.insert("com.anydo".to_string(), "Any.do".to_string());
    m.insert("com.notion.android".to_string(), "Notion".to_string());
    m.insert(
        "com.teamviewer.teamviewer.market.mobile".to_string(),
        "TeamViewer".to_string(),
    );
    m.insert(
        "com.anydesk.anydeskandroid".to_string(),
        "AnyDesk".to_string(),
    );
    m.insert("com.lastpass.lpandroid".to_string(), "LastPass".to_string());
    m.insert("com.dashlane".to_string(), "Dashlane".to_string());
    m.insert(
        "com.agilebits.onepassword".to_string(),
        "1Password".to_string(),
    );
    m.insert("bitwarden.mobile".to_string(), "Bitwarden".to_string());
    m.insert("com.authy.authy".to_string(), "Authy".to_string());
    m.insert(
        "com.google.android.apps.authenticator2".to_string(),
        "Google Authenticator".to_string(),
    );
    m.insert(
        "com.azure.authenticator".to_string(),
        "Microsoft Authenticator".to_string(),
    );

    // ---------------------------------------------------------------------
    // BROWSERS
    // ---------------------------------------------------------------------
    m.insert(
        "com.android.chrome".to_string(),
        "Google Chrome".to_string(),
    );
    m.insert(
        "org.mozilla.firefox".to_string(),
        "Mozilla Firefox".to_string(),
    );
    m.insert("com.opera.browser".to_string(), "Opera Browser".to_string());
    m.insert(
        "com.opera.mini.native".to_string(),
        "Opera Mini".to_string(),
    );
    m.insert(
        "com.microsoft.emmx".to_string(),
        "Microsoft Edge".to_string(),
    );
    m.insert("com.brave.browser".to_string(), "Brave Browser".to_string());
    m.insert(
        "com.duckduckgo.mobile.android".to_string(),
        "DuckDuckGo".to_string(),
    );
    m.insert(
        "com.samsung.android.app.sbrowser".to_string(),
        "Samsung Internet".to_string(),
    );
    m.insert(
        "com.yandex.browser".to_string(),
        "Yandex Browser".to_string(),
    );
    m.insert("com.uc.browser.en".to_string(), "UC Browser".to_string());
    m.insert(
        "org.torproject.torbrowser".to_string(),
        "Tor Browser".to_string(),
    );

    // ---------------------------------------------------------------------
    // SHOPPING & E-COMMERCE
    // ---------------------------------------------------------------------
    m.insert(
        "com.amazon.mShop.android.shopping".to_string(),
        "Amazon Shopping".to_string(),
    );
    m.insert("com.ebay.mobile".to_string(), "eBay".to_string());
    m.insert(
        "com.alibaba.aliexpresshd".to_string(),
        "AliExpress".to_string(),
    );
    m.insert("com.walmart.android".to_string(), "Walmart".to_string());
    m.insert("com.target.ui".to_string(), "Target".to_string());
    m.insert("com.etsy.android".to_string(), "Etsy".to_string());
    m.insert("com.contextlogic.wish".to_string(), "Wish".to_string());
    m.insert("com.zzkko".to_string(), "Shein".to_string());
    m.insert("com.nike.omega".to_string(), "Nike".to_string());
    m.insert("com.adidas.app".to_string(), "adidas".to_string());
    m.insert("com.zara.android".to_string(), "Zara".to_string());
    m.insert("com.hm.goe".to_string(), "H&M".to_string());

    // ---------------------------------------------------------------------
    // TRAVEL & TRANSPORT
    // ---------------------------------------------------------------------
    m.insert("com.ubercab".to_string(), "Uber".to_string());
    m.insert("me.lyft.android".to_string(), "Lyft".to_string());
    m.insert("com.grabtaxi.passenger".to_string(), "Grab".to_string());
    m.insert("com.olacabs.customer".to_string(), "Ola".to_string());
    m.insert("com.booking".to_string(), "Booking.com".to_string());
    m.insert("com.airbnb.android".to_string(), "Airbnb".to_string());
    m.insert(
        "com.tripadvisor.tripadvisor".to_string(),
        "Tripadvisor".to_string(),
    );
    m.insert("com.expedia.bookings".to_string(), "Expedia".to_string());
    m.insert("com.trivago".to_string(), "Trivago".to_string());
    m.insert("com.agoda.mobile.consumer".to_string(), "Agoda".to_string());
    m.insert(
        "com.skyscanner.android.main".to_string(),
        "Skyscanner".to_string(),
    );
    m.insert("com.waze".to_string(), "Waze".to_string());
    m.insert("com.here.app.maps".to_string(), "HERE WeGo".to_string());

    // ---------------------------------------------------------------------
    // GAMES (POPULAR)
    // ---------------------------------------------------------------------
    m.insert(
        "com.mojang.minecraftpe".to_string(),
        "Minecraft".to_string(),
    );
    m.insert("com.roblox.client".to_string(), "Roblox".to_string());
    m.insert(
        "com.nianticlabs.pokemongo".to_string(),
        "Pokémon GO".to_string(),
    );
    m.insert(
        "com.supercell.clashofclans".to_string(),
        "Clash of Clans".to_string(),
    );
    m.insert(
        "com.supercell.clashroyale".to_string(),
        "Clash Royale".to_string(),
    );
    m.insert(
        "com.supercell.brawlstars".to_string(),
        "Brawl Stars".to_string(),
    );
    m.insert(
        "com.king.candycrushsaga".to_string(),
        "Candy Crush Saga".to_string(),
    );
    m.insert(
        "com.king.candycrushsodasaga".to_string(),
        "Candy Crush Soda Saga".to_string(),
    );
    m.insert(
        "com.activision.callofduty.shooter".to_string(),
        "Call of Duty: Mobile".to_string(),
    );
    m.insert("com.pubg.kmobile".to_string(), "PUBG Mobile".to_string());
    m.insert("com.dts.freefireth".to_string(), "Free Fire".to_string());
    m.insert("com.epicgames.fortnite".to_string(), "Fortnite".to_string());
    m.insert(
        "com.ea.gp.fifamobile".to_string(),
        "EA SPORTS FC Mobile".to_string(),
    );
    m.insert(
        "com.firsttouchgames.dls3".to_string(),
        "Dream League Soccer".to_string(),
    );
    m.insert(
        "com.konami.pesam".to_string(),
        "eFootball Mobile".to_string(),
    );
    m.insert(
        "com.kiloo.subwaysurf".to_string(),
        "Subway Surfers".to_string(),
    );
    m.insert(
        "com.imangi.templerun2".to_string(),
        "Temple Run 2".to_string(),
    );
    m.insert(
        "com.plarium.raidlegends".to_string(),
        "Raid: Shadow Legends".to_string(),
    );
    m.insert(
        "com.lilithgame.roc.gp".to_string(),
        "Rise of Kingdoms".to_string(),
    );
    m.insert(
        "com.moonactive.coinmaster".to_string(),
        "Coin Master".to_string(),
    );
    m.insert(
        "com.playrix.homescapes".to_string(),
        "Homescapes".to_string(),
    );
    m.insert(
        "com.playrix.gardenscapes".to_string(),
        "Gardenscapes".to_string(),
    );
    m.insert("com.playrix.township".to_string(), "Township".to_string());
    m.insert(
        "com.peakgames.toonblast".to_string(),
        "Toon Blast".to_string(),
    );
    m.insert(
        "com.rovio.angrybirds".to_string(),
        "Angry Birds Classic".to_string(),
    );
    m.insert("com.rovio.baba".to_string(), "Angry Birds 2".to_string());
    m.insert(
        "com.outfit7.mytalkingtomfree".to_string(),
        "My Talking Tom".to_string(),
    );
    m.insert(
        "com.gameloft.android.ANMP.GloftA8HM".to_string(),
        "Asphalt 8".to_string(),
    );
    m.insert(
        "com.gameloft.android.ANMP.GloftA9HM".to_string(),
        "Asphalt 9".to_string(),
    );
    m.insert(
        "com.miHoYo.GenshinImpact".to_string(),
        "Genshin Impact".to_string(),
    );
    m.insert(
        "com.netease.lztgglobal".to_string(),
        "Rules of Survival".to_string(),
    );
    m.insert(
        "com.igggames.lordsmobile".to_string(),
        "Lords Mobile".to_string(),
    );
    m.insert(
        "com.mobile.legends".to_string(),
        "Mobile Legends: Bang Bang".to_string(),
    );
    m.insert(
        "com.riotgames.league.wildrift".to_string(),
        "League of Legends: Wild Rift".to_string(),
    );
    m.insert(
        "com.riotgames.legendsofruneterra".to_string(),
        "Legends of Runeterra".to_string(),
    );
    m.insert(
        "com.riotgames.league.teamfighttactics".to_string(),
        "Teamfight Tactics".to_string(),
    );
    m.insert(
        "com.blizzard.wtcg.hearthstone".to_string(),
        "Hearthstone".to_string(),
    );

    // ---------------------------------------------------------------------
    // FINANCE & BANKING (Global)
    // ---------------------------------------------------------------------
    m.insert(
        "com.paypal.android.p2pmobile".to_string(),
        "PayPal".to_string(),
    );
    m.insert("com.squareup.cash".to_string(), "Cash App".to_string());
    m.insert("com.venmo".to_string(), "Venmo".to_string());
    m.insert("net.one97.paytm".to_string(), "Paytm".to_string());
    m.insert(
        "com.google.android.apps.walletnfcrel".to_string(),
        "Google Wallet".to_string(),
    );
    m.insert("com.revolut.revolut".to_string(), "Revolut".to_string());
    m.insert("de.n26.android".to_string(), "N26".to_string());
    m.insert("com.wise.mpay".to_string(), "Wise".to_string());
    m.insert("com.coinbase.android".to_string(), "Coinbase".to_string());
    m.insert("com.binance.dev".to_string(), "Binance".to_string());

    // ---------------------------------------------------------------------
    // TURKISH APPS (Local Popularity)
    // ---------------------------------------------------------------------
    m.insert("com.sahibinden".to_string(), "sahibinden.com".to_string());
    m.insert("com.getir".to_string(), "Getir".to_string());
    m.insert(
        "com.yemeksepeti.android".to_string(),
        "Yemeksepeti".to_string(),
    );
    m.insert("com.trendyol.mobile".to_string(), "Trendyol".to_string());
    m.insert("com.gitti.gidiyor".to_string(), "GittiGidiyor".to_string());
    m.insert("com.n11".to_string(), "n11.com".to_string());
    m.insert(
        "com.amazon.mShop.android.shopping".to_string(),
        "Amazon Türkiye".to_string(),
    );
    m.insert("com.mydm.android".to_string(), "Hepsiburada".to_string());
    m.insert("com.akakce.akakce".to_string(), "Akakçe".to_string());
    m.insert("com.cimri".to_string(), "Cimri".to_string());
    m.insert("com.dolap.android".to_string(), "Dolap".to_string());
    m.insert("com.letgo.android".to_string(), "letgo".to_string());
    m.insert(
        "com.pozitron.hepsiburada".to_string(),
        "Hepsiburada".to_string(),
    );
    m.insert(
        "tr.gov.turkiye.edevlet.kapisi".to_string(),
        "e-Devlet".to_string(),
    );
    m.insert("tr.gov.saglik.enabiz".to_string(), "e-Nabız".to_string());
    m.insert(
        "tr.gov.saglik.hayatevesigar".to_string(),
        "Hayat Eve Sığar".to_string(),
    );
    m.insert("com.mhrs.vatandas".to_string(), "MHRS".to_string());
    m.insert("com.turkcell.online".to_string(), "Turkcell".to_string());
    m.insert(
        "com.vodafone.selfservis".to_string(),
        "Vodafone Yanımda".to_string(),
    );
    m.insert(
        "com.avea.customer.service".to_string(),
        "Türk Telekom".to_string(),
    );
    m.insert(
        "com.ykb.android".to_string(),
        "Yapı Kredi Mobile".to_string(),
    );
    m.insert(
        "com.garanti.cepsubesi".to_string(),
        "Garanti BBVA Mobile".to_string(),
    );
    m.insert(
        "com.akbank.android.apps.akbank_direkt".to_string(),
        "Akbank".to_string(),
    );
    m.insert("com.softtech.isbankasi".to_string(), "İşCep".to_string());
    m.insert(
        "com.finansbank.mobile.cepsube".to_string(),
        "QNB Finansbank".to_string(),
    );
    m.insert(
        "com.ziraat.ziraatmobil".to_string(),
        "Ziraat Mobile".to_string(),
    );
    m.insert("com.vakifbank.mobile".to_string(), "VakıfBank".to_string());
    m.insert("com.halkbank.android".to_string(), "Halkbank".to_string());
    m.insert(
        "com.denizbank.mobildeniz".to_string(),
        "MobilDeniz".to_string(),
    );
    m.insert("com.teb".to_string(), "CEPTETEB".to_string());
    m.insert("com.papara.papara".to_string(), "Papara".to_string());
    m.insert("com.ininal.wallet".to_string(), "ininal".to_string());
    m.insert("com.tosla.app".to_string(), "Tosla".to_string());
    m.insert("com.turkcell.bip".to_string(), "BiP".to_string());
    m.insert(
        "com.dsmgroup.trendyol.market".to_string(),
        "Trendyol Hızlı Market".to_string(),
    );
    m.insert(
        "com.dsmgroup.trendyol.yemek".to_string(),
        "Trendyol Yemek".to_string(),
    );

    // ---------------------------------------------------------------------
    // UTILITIES (Advanced)
    // ---------------------------------------------------------------------
    m.insert("eu.thedarken.sdm".to_string(), "SD Maid".to_string());
    m.insert(
        "com.google.android.diskusage".to_string(),
        "DiskUsage".to_string(),
    );
    m.insert(
        "com.rascarlo.granular.immersive.mode".to_string(),
        "Granular Immersive Mode".to_string(),
    );
    m.insert(
        "com.draco.ladb".to_string(),
        "LADB — Local ADB Shell".to_string(),
    );
    m.insert("com.termux".to_string(), "Termux".to_string());
    m.insert(
        "jackpal.androidterm".to_string(),
        "Terminal Emulator".to_string(),
    );
    m.insert("stericson.busybox".to_string(), "BusyBox".to_string());
    m.insert("com.topjohnwu.magisk".to_string(), "Magisk".to_string());
    m.insert(
        "de.robv.android.xposed.installer".to_string(),
        "Xposed Installer".to_string(),
    );
    m.insert("org.lsposed.manager".to_string(), "LSPosed".to_string());

    m
}
