// credits to vortisRD
const tikTokChatEmotes = {
    "[wow]": "wow.png",
    "[laugh]": "laugh.png",
    "[thanks]": "thanks.png",
    "[laughcry]": "laughcry.png",
    "[thumb]": "thumb.png",
    "[hi]": "hi.png",
    "[heart]": "heart.png",
    "[congrat]": "congrat.png",
    "[rockyserious]": "rockyserious.png",
    "[rockyloveit]": "rockyloveit.png",
    "[rockyproud]": "rockyproud.png",
    "[rockycool]": "rockycool.png",
    "[rosiedislike]": "rosiedislike.png",
    "[rosieawkward]": "rosieawkward.png",
    "[rosiekisskiss]": "rosiekisskiss.png",
    "[rosiecute]": "rosiecute.png",
    "[jolliekissingface]": "jolliekissingface.png",
    "[jolliewow]": "jolliewow.png",
    "[jolliespeechless]": "jolliespeechless.png",
    "[jolliesatisfied]": "jolliesatisfied.png",
    "[sagethink]": "sagethink.png",
    "[sagefulfilled]": "sagefulfilled.png",
    "[sageclever]": "sageclever.png",
    "[sagemoney]": "sagemoney.png",
    "[grinning]": "😀",
    "[smiley]": "😃",
    "[smile]": "😄",
    "[grin]": "😁",
    "[laughing]": "😆",
    "[sweat_smile]": "😅",
    "[rofl]": "🤣",
    "[joy]": "😂",
    "[slightly_smiling_face]": "🙂",
    "[upside_down_face]": "🙃",
    "[wink]": "😉",
    "[blush]": "😊",
    "[innocent]": "😇",
    "[heart_eyes]": "😍",
    "[kissing_heart]": "😘",
    "[kissing]": "😗",
    "[kissing_closed_eyes]": "😚",
    "[kissing_smiling_eyes]": "😙",
    "[yum]": "😋",
    "[stuck_out_tongue]": "😛",
    "[stuck_out_tongue_winking_eye]": "😜",
    "[stuck_out_tongue_closed_eyes]": "😝",
    "[money_mouth_face]": "🤑",
    "[hugs]": "🤗",
    "[thinking]": "🤔",
    "[zipper_mouth_face]": "🤐",
    "[neutral_face]": "😐",
    "[expressionless]": "😑",
    "[no_mouth]": "😶",
    "[smirk]": "😏",
    "[unamused]": "😒",
    "[roll_eyes]": "🙄",
    "[grimacing]": "😬",
    "[lying_face]": "🤥",
    "[relieved]": "😌",
    "[pensive]": "😔",
    "[sleepy]": "😪",
    "[drooling_face]": "🤤",
    "[sleeping]": "😴",
    "[mask]": "😷",
    "[face_with_thermometer]": "🤒",
    "[face_with_head_bandage]": "🤕",
    "[nauseated_face]": "🤢",
    "[sneezing_face]": "🤧",
    "[dizzy_face]": "😵",
    "[cowboy_hat_face]": "🤠",
    "[sunglasses]": "😎",
    "[nerd_face]": "🤓",
    "[confused]": "😕",
    "[worried]": "😟",
    "[slightly_frowning_face]": "🙁",
    "[open_mouth]": "😮",
    "[hushed]": "😯",
    "[astonished]": "😲",
    "[flushed]": "😳",
    "[frowning]": "😦",
    "[anguished]": "😧",
    "[fearful]": "😨",
    "[cold_sweat]": "😰",
    "[disappointed_relieved]": "😥",
    "[cry]": "😢",
    "[sob]": "😭",
    "[scream]": "😱",
    "[confounded]": "😖",
    "[persevere]": "😣",
    "[disappointed]": "😞",
    "[sweat]": "😓",
    "[weary]": "😩",
    "[tired_face]": "😫",
    "[triumph]": "😤",
    "[rage]": "😡",
    "[angry]": "😠",
    "[smiling_imp]": "😈",
    "[imp]": "👿",
    "[skull]": "💀",
    "[hankey]": "💩",
    "[clown_face]": "🤡",
    "[japanese_ogre]": "👹",
    "[japanese_goblin]": "👺",
    "[ghost]": "👻",
    "[alien]": "👽",
    "[space_invader]": "👾",
    "[robot]": "🤖",
    "[smiley_cat]": "😺",
    "[smile_cat]": "😸",
    "[joy_cat]": "😹",
    "[heart_eyes_cat]": "😻",
    "[smirk_cat]": "😼",
    "[kissing_cat]": "😽",
    "[scream_cat]": "🙀",
    "[crying_cat_face]": "😿",
    "[pouting_cat]": "😾"
}

// credits to vortisRD
// TikFinity's chat payload names a user's grade, fan-club and moderator badges
// but ships an image url for none of them — only the top-gifter badge carries
// its own `url`. These are the icons TikTok itself serves, scraped by vortisRD,
// so the missing three can be synthesized from the level in the payload.
//
// Icons are bare filenames off `base`, the same way tikTokChatEmotes stores
// emote filenames; Utils.getTikTokBadges joins them. A tier applies from its
// `min` up to the next tier's, so a level past the last row clamps to it.
const tikTokBadgeData = {
    base: "https://p16-webcast.tiktokcdn.com/webcast-va/",

    // badgeSceneType 8 — colors deepen with the tier
    grade: [
        { min: 1,  icon: "grade_badge_icon_lite_lv1_v1.png~tplv-obj.image",  color: "rgba(120, 158, 231, .6)" },
        { min: 5,  icon: "grade_badge_icon_lite_lv5_v1.png~tplv-obj.image",  color: "rgba(95, 144, 239, .6)"  },
        { min: 10, icon: "grade_badge_icon_lite_lv10_v1.png~tplv-obj.image", color: "rgba(63, 125, 246, .6)"  },
        { min: 15, icon: "grade_badge_icon_lite_lv15_v2.png~tplv-obj.image", color: "rgba(71, 126, 255, .7)"  },
        { min: 20, icon: "grade_badge_icon_lite_lv20_v1.png~tplv-obj.image", color: "rgba(71, 90, 255, .7)"   },
        { min: 25, icon: "grade_badge_icon_lite_lv25_v1.png~tplv-obj.image", color: "rgba(39, 47, 243, .7)"   },
        { min: 30, icon: "grade_badge_icon_lite_lv30_v1.png~tplv-obj.image", color: "rgba(42, 25, 238, .75)"  },
        // vortisRD's css only defines colors through grade 30, so the tiers above
        // step up through the real icons but hold grade 30's color rather than
        // invent one.
        { min: 35, icon: "grade_badge_icon_lite_lv35_v3.png~tplv-obj.image", color: "rgba(42, 25, 238, .75)"  },
        { min: 40, icon: "grade_badge_icon_lite_lv40_v2.png~tplv-obj.image", color: "rgba(42, 25, 238, .75)"  },
        { min: 45, icon: "grade_badge_icon_lite_lv45_v1.png~tplv-obj.image", color: "rgba(42, 25, 238, .75)"  },
        { min: 50, icon: "grade_badge_icon_lite_lv50_v1.png~tplv-obj.image", color: "rgba(42, 25, 238, .75)"  }
    ],

    // badgeSceneType 10 — a fan-club member gets one of two looks depending on
    // whether they're subscribed (data.isSubscriber): plain members use the
    // "webcast-va-…-v2" icon set, subscribers ("super fans") get a different
    // icon set plus an orange border. Both share one color across all tiers;
    // the icon steps every ten levels.
    fan: [
        { min: 1,  icon: "webcast-va-fans_badge_icon_lv1_v2.png~tplv-obj.image",  color: "rgba(255, 94, 58, .5)" },
        { min: 10, icon: "webcast-va-fans_badge_icon_lv10_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
        { min: 20, icon: "webcast-va-fans_badge_icon_lv20_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
        { min: 30, icon: "webcast-va-fans_badge_icon_lv30_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
        { min: 40, icon: "webcast-va-fans_badge_icon_lv40_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
        { min: 50, icon: "webcast-va-fans_badge_icon_lv50_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" }
    ],

    fanSubscriber: {
        border: "#ffb878",
        tiers: [
            { min: 1,  icon: "fans_badge_icon_lv1_v4.png~tplv-obj.image",  color: "rgba(255, 94, 58, .5)" },
            { min: 10, icon: "fans_badge_icon_lv10_v4.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
            { min: 20, icon: "fans_badge_icon_lv20_v4.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
            { min: 30, icon: "fans_badge_icon_lv30_v4.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
            { min: 40, icon: "fans_badge_icon_lv40_v4.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
            { min: 50, icon: "fans_badge_icon_lv50_v4.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" }
        ]
    },

    // badgeSceneType 6 — the payload supplies this one's icon
    topGifter: { color: "rgba(254, 44, 85, .4)" },

    // badgeSceneType 1. TikTok's #803F3F3F is Android AARRGGBB: alpha 0x80/255.
    mod: {
        icon: "moderater_badge_icon.png~tplv-obj.image",
        color: "rgba(63, 63, 63, .5)"
    }
}