/**
 * Static Database of known Android Package Names.
 * This acts as a "knowledge base" to map raw package names (com.foo.bar) to human readable labels.
 * 
 * Sources:
 * - Common Android packages (AOSP)
 * - Google Apps
 * - Samsung OneUI Bloatware
 * - Xiaomi MIUI/HyperOS Bloatware
 * - Social Media & Common User Apps
 */

export const PACKAGE_DB: Record<string, string> = {
    // --- GOOGLE & AOSP ---
    'com.android.vending': 'Google Play Store',
    'com.google.android.gms': 'Google Play Services',
    'com.google.android.gsf': 'Google Services Framework',
    'com.android.chrome': 'Google Chrome',
    'com.google.android.youtube': 'YouTube',
    'com.google.android.apps.maps': 'Google Maps',
    'com.google.android.gm': 'Gmail',
    'com.google.android.googlequicksearchbox': 'Google App',
    'com.google.android.apps.photos': 'Google Photos',
    'com.google.android.calendar': 'Google Calendar',
    'com.google.android.apps.messaging': 'Google Messages',
    'com.google.android.dialer': 'Google Phone',
    'com.google.android.contacts': 'Google Contacts',
    'com.google.android.calculator': 'Calculator',
    'com.google.android.deskclock': 'Clock',
    'com.google.android.keep': 'Google Keep',
    'com.google.android.music': 'Google Play Music',
    'com.google.android.apps.docs': 'Google Drive',
    'com.google.android.apps.docs.editors.sheets': 'Google Sheets',
    'com.google.android.apps.docs.editors.docs': 'Google Docs',
    'com.google.android.apps.docs.editors.slides': 'Google Slides',
    'com.google.android.videos': 'Google TV',
    'com.google.android.apps.tachyon': 'Google Meet',
    'com.google.android.apps.youtube.music': 'YouTube Music',
    'com.android.settings': 'Settings',
    'com.android.systemui': 'System UI',
    'com.android.phone': 'Phone Services',
    'com.android.server.telecom': 'Telecom Server',

    // --- SAMSUNG ---
    'com.sec.android.app.sbrowser': 'Samsung Internet',
    'com.samsung.android.messaging': 'Samsung Messages',
    'com.samsung.android.contacts': 'Samsung Contacts',
    'com.samsung.android.dialer': 'Samsung Phone',
    'com.sec.android.app.camera': 'Samsung Camera',
    'com.sec.android.gallery3d': 'Samsung Gallery',
    'com.samsung.android.email.provider': 'Samsung Email',
    'com.samsung.android.calendar': 'Samsung Calendar',
    'com.sec.android.app.myfiles': 'My Files',
    'com.sec.android.app.music': 'Samsung Music',
    'com.samsung.android.app.notes': 'Samsung Notes',
    'com.samsung.android.oneconnect': 'SmartThings',
    'com.samsung.android.voc': 'Samsung Members',
    'com.samsung.android.lool': 'Game Launcher',
    'com.samsung.android.game.gamehome': 'Game Launcher (New)',
    'com.samsung.android.app.watchmanager': 'Galaxy Wearable',
    'com.samsung.android.scloud': 'Samsung Cloud',
    'com.samsung.android.bixby.agent': 'Bixby Voice',
    'com.samsung.android.app.spage': 'Bixby Home',
    'com.samsung.android.visionintelligence': 'Bixby Vision',
    'com.samsung.android.ardrawing': 'AR Doodle',
    'com.samsung.android.arzone': 'AR Zone',
    'com.sec.android.app.voicenote': 'Voice Recorder',
    'com.samsung.android.app.calculator': 'Samsung Calculator',
    'com.sec.android.app.clockpackage': 'Samsung Clock',
    'com.samsung.android.app.reminder': 'Reminder',
    'com.samsung.android.app.routines': 'Bixby Routines',
    'com.samsung.android.emojiupdater': 'AR Emoji Editor',
    'com.samsung.android.mobileservice': 'Samsung Experience Service',
    'com.samsung.android.mateagent': 'Samsung Galaxy Friends',

    // --- XIAOMI / POCO ---
    'com.miui.home': 'System Launcher',
    'com.miui.securitycenter': 'Security',
    'com.miui.gallery': 'Gallery',
    'com.miui.player': 'Music',
    'com.miui.video': 'Mi Video',
    'com.miui.calculator': 'Calculator',
    'com.miui.weather2': 'Weather',
    'com.miui.notes': 'Notes',
    'com.miui.cleanmaster': 'Cleaner',
    'com.miui.compass': 'Compass',
    'com.miui.screenrecorder': 'Screen Recorder',
    'com.miui.backup': 'Backup',
    'com.miui.cloudservice': 'Xiaomi Cloud',
    'com.miui.micloudsync': 'Cloud Sync',
    'com.miui.cloudbackup': 'Cloud Backup',
    'com.miui.hybrid': 'Quick Apps',
    'com.miui.analytics': 'Analytics',
    'com.miui.daemon': 'Mi Daemon',
    'com.miui.msa.global': 'MSA (Ad Services)',
    'com.xiaomi.midrop': 'ShareMe',
    'com.xiaomi.mipicks': 'GetApps',
    'com.xiaomi.scanner': 'Scanner',
    'com.xiaomi.calendar': 'Calendar',
    'com.xiaomi.glgm': 'Games',
    'com.xiaomi.joyose': 'Joyose (Game Booster)',
    'com.xiaomi.account': 'Xiaomi Account',
    'com.xiaomi.payment': 'Xiaomi Payment',

    // --- SOCIAL & POPULAR ---
    'com.facebook.katana': 'Facebook',
    'com.facebook.orca': 'Messenger',
    'com.instagram.android': 'Instagram',
    'com.twitter.android': 'X (Twitter)',
    'com.zhiliaoapp.musically': 'TikTok',
    'com.snapchat.android': 'Snapchat',
    'com.whatsapp': 'WhatsApp',
    'com.whatsapp.w4b': 'WhatsApp Business',
    'org.telegram.messenger': 'Telegram',
    'com.discord': 'Discord',
    'com.reddit.frontpage': 'Reddit',
    'com.linkedin.android': 'LinkedIn',
    'com.spotify.music': 'Spotify',
    'com.netflix.mediaclient': 'Netflix',
    'com.amazon.mp3': 'Amazon Music',
    'com.amazon.mShop.android.shopping': 'Amazon Shopping',
    'com.ebay.mobile': 'eBay',
    'com.alibaba.aliexpresshd': 'AliExpress',
    'tv.twitch.android.app': 'Twitch',
    'com.microsoft.teams': 'Microsoft Teams',
    'com.microsoft.office.outlook': 'Outlook',
    'com.microsoft.office.word': 'Word',
    'com.microsoft.office.excel': 'Excel',
    'com.microsoft.office.powerpoint': 'PowerPoint',
    'com.adobe.reader': 'Adobe Acrobat',
    'com.google.android.apps.authenticator2': 'Google Authenticator',
    'com.authy.authy': 'Authy',
    'com.valvesoftware.android.steam.community': 'Steam',
    'com.pinterest': 'Pinterest',
    'com.tinder': 'Tinder',
    'com.ubercab': 'Uber',
    'com.airbnb.android': 'Airbnb',
};

/**
 * Tries to prettify a package name even if it's not in the DB.
 * e.g. "com.example.my_cool_app" -> "My Cool App"
 */
export function smartFormatPackage(packageName: string): string {
    // 1. Check exact match in DB
    if (PACKAGE_DB[packageName]) {
        return PACKAGE_DB[packageName];
    }

    // 2. Try to extract last segment
    const parts = packageName.split('.');
    if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];

        // Exclude common boring suffixes
        if (lastPart !== 'android' && lastPart !== 'app' && lastPart !== 'mobile') {
            // "my_cool_app" -> "My Cool App"
            return lastPart
                .split(/[_.-]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        }
    }

    // 3. Fallback: Return raw package name
    return packageName;
}
