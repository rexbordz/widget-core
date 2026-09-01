const Utils = {
  async getTwitchAvatar(username) {
    const url = `https://decapi.me/twitch/avatar/${encodeURIComponent(username)}`;

    try {
      const response = await fetch(url);
      return await response.text();

    } catch (err) {
      console.error(`[getTwitchAvatar] Error fetching avatar for "${username}": ${err.message}`);
    }
  },

  // Kick's channel endpoint is the only source of a user's avatar, and chat
  // handlers ask for one per message — cache so a busy chat doesn't refetch the
  // same picture hundreds of times. Failures aren't cached, so they can retry.
  _kickAvatars: new Map(),

  async getKickAvatar(username) {
    const genericAvatar = "https://files.kick.com/images/user/4545493/profile_image/conversion/default1-medium.webp";
    if (!username) return genericAvatar;
    if (Utils._kickAvatars.has(username)) return Utils._kickAvatars.get(username);

    try {
      const response = await fetch(`https://kick.com/api/v2/channels/${username}`);
      const data = await response.json();
      let profilePicUrl = data.user?.profile_pic || genericAvatar;

      if (profilePicUrl) {
        // Replace 'fullsize' with 'medium'
        profilePicUrl = profilePicUrl.replace("fullsize", "medium");
      }

      Utils._kickAvatars.set(username, profilePicUrl);
      return profilePicUrl;

    } catch (err) {
      console.error("Error fetching Kick profile picture:", err);
      return genericAvatar;
    }
  },

  // credits to nutty. Use this to get the super sticker URL.
  findFirstImageUrl(jsonObject) {
    if (typeof jsonObject !== 'object' || jsonObject === null) {
      return null; // Handle invalid input
    }

    function iterate(obj) {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const result = iterate(item);
          if (result) {
            return result;
          }
        }
        return null;
      }

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (key === 'imageUrl') {
            return obj[key]; // Found it! Return the value.
          }

          if (typeof obj[key] === 'object' && obj[key] !== null) {
            const result = iterate(obj[key]); // Recursive call for nested objects
            if (result) {
              return result; // Propagate the found value
            }
          }
        }
      }
      return null; // Key not found in this level
    }

    return iterate(jsonObject);
  },

  // credits to nutty. Use this to resolve messages with emotes.
  renderMessageWithEmotesHtml(originalMessage, emotes) {
    if (!emotes || emotes.length === 0) return originalMessage;

    // Sort emotes by startIndex
    emotes.sort((a, b) => a.startIndex - b.startIndex);

    let html = '';
    let cursor = 0;

    emotes.forEach(emote => {
        // Add text before the emote
        if (emote.startIndex > cursor) {
            html += Utils.escapeHtml(originalMessage.slice(cursor, emote.startIndex));
        }

        // Add emote image
        html += `<img src="${Utils.escapeHtml(emote.imageUrl)}" alt="${Utils.escapeHtml(emote.name)}" title="${Utils.escapeHtml(emote.name)}" class="emote">`;

        cursor = emote.endIndex + 1;
    });

    // Add remaining text after last emote
    if (cursor < originalMessage.length) {
        html += Utils.escapeHtml(originalMessage.slice(cursor));
    }

    return html;
  },

  // TikTok's emote objects carry `emoteImageUrl`/`emoteId` and a single
  // `placeInComment` index rather than a startIndex/endIndex span, so each
  // emote replaces exactly one placeholder character in the comment. Requires
  // tikTokChatEmotes (utils/tiktok-emotes.js) to be loaded first.
  renderTikTokMessageWithEmotesHtml(originalMessage, emotes) {
    const text = String(originalMessage ?? '');

    if (!emotes || emotes.length === 0) return Utils.renderTikTokTextSegment(text);
    const sorted = [...emotes].sort((a, b) => a.placeInComment - b.placeInComment);

    let html = '';
    let cursor = 0;

    sorted.forEach(emote => {
      // Add text before the emote
      if (emote.placeInComment > cursor) {
        html += Utils.renderTikTokTextSegment(text.slice(cursor, emote.placeInComment));
      }

      // Add emote image, replacing the single placeholder character
      const label = Utils.escapeHtml(emote.emoteId ?? '');
      html += `<img src="${Utils.escapeHtml(emote.emoteImageUrl)}" alt="${label}" title="${label}" class="emote">`;

      cursor = emote.placeInComment + 1;
    });

    // Add remaining text after last emote
    if (cursor < text.length) {
      html += Utils.renderTikTokTextSegment(text.slice(cursor));
    }

    return html;
  },

  // Plain text segments can also contain typed shortcodes like "[laughcry]",
  // mapped in tikTokChatEmotes (utils/tiktok-emotes.js) to either a PNG
  // filename served from assets/images/tiktok/emotes/ or a plain unicode
  // emoji. Walk the segment and swap any recognised shortcode in place,
  // escaping everything else.
  renderTikTokTextSegment(segment) {
    let html = '';
    let cursor = 0;
    const shortcodePattern = /\[[a-z0-9_]+\]/gi;
    let match;

    while ((match = shortcodePattern.exec(segment)) !== null) {
      const token = match[0];
      const value = tikTokChatEmotes[token];

      if (value === undefined) continue; // Not a known shortcode, leave as literal text

      html += Utils.escapeHtml(segment.slice(cursor, match.index));

      if (value.endsWith('.png')) {
        const label = Utils.escapeHtml(token);
        html += `<img src="${Utils.escapeHtml(`https://rexbordz.github.io/widget-core/assets/images/tiktok/emotes/${value}`)}" alt="${label}" title="${label}" class="emote">`;
      } else {
        // Value is a plain unicode emoji, not a filename
        html += Utils.escapeHtml(value);
      }

      cursor = match.index + token.length;
    }

    html += Utils.escapeHtml(segment.slice(cursor));
    return html;
  },

  async getKickIds(username) {
    // First attempt with the original username
    let url = `https://kick.com/api/v2/channels/${username}`;

    try {
      let response = await fetch(url);
      if (!response.ok) {
        // Retry with underscores replaced by dashes
        const altUsername = username.replace(/_/g, "-");
        url = `https://kick.com/api/v2/channels/${altUsername}`;
        response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
      }

      const data = await response.json();
      if (data.chatroom && data.chatroom.id) {
        // `userId` is what 7TV keys a Kick channel on — not the channel or
        // chatroom id. See getKick7TVEmotes.
        return { chatroomId: data.chatroom.id, channelId: data.chatroom.channel_id, userId: data.user_id };
      } else {
        throw new Error("Chatroom ID not found in response.");
      }
    } catch (error) {
      console.error("Failed to fetch chatroom ID:", error.message);
      return null;
    }
  },

  async getKickSubBadges(username) {
    let url = `https://kick.com/api/v2/channels/${username}`;

    try {
      let response = await fetch(url);
      if (!response.ok) {
        // Retry with underscores replaced by dashes
        const altUsername = username.replace(/_/g, "-");
        url = `https://kick.com/api/v2/channels/${altUsername}`;
        response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
      }

      const data = await response.json();
      return data.subscriber_badges || [];
    } catch (error) {
      console.error("Failed to fetch subscriber badges:", error.message);
      return [];
    }
  },

  // The badge SVGs shipped in each widget's assets/images/kick folder. A type
  // that isn't here has no file on disk, so it falls back to a text chip rather
  // than a broken image — Kick adds badge types faster than we add files.
  _kickBadgeTypes: [
    'bot', 'broadcaster', 'founder', 'moderator', 'og',
    'sidekick', 'sub_gifter', 'subscriber', 'verified', 'vip'
  ],

  // credits to vortisRD
  // Kick splits a user's badges across two arrays: `badges` holds the role
  // badges (moderator, subscriber, …) and carries no image at all, while
  // `badges_v2` holds global ones like the level badge and does carry a CDN
  // url. Both sides carry Kick's own `sort_order`, so pool them and sort on it
  // instead of guessing at an order.
  //
  // Returns the { icon, label } descriptors the overlay's badge renderer takes,
  // not HTML — the renderer draws icons as CSS background images.
  getKickBadges(identity, { subBadges = [], iconBase = 'assets/images/kick/' } = {}) {
    const items = [];

    // `selected` is the user's own choice of which global badge to display, so
    // honour it — Kick's chat hides the unselected ones too.
    (identity?.badges_v2 || []).forEach((badge) => {
      if (!badge || badge.badge_type !== 'global' || badge.selected !== true || !badge.image_url) return;

      const level = badge.metadata?.level;
      const label = badge.name === 'level' && level != null ? `level ${level}` : (badge.name || '');
      items.push({ sort: badge.sort_order, icon: badge.image_url, label });
    });

    (identity?.badges || []).forEach((badge) => {
      if (!badge || !badge.type) return;

      let icon = null;
      let fallbackIcon = null;
      if (badge.type === 'subscriber') {
        // Highest tier the user has actually earned. A channel may define no
        // tiers at all, in which case the generic icon stands in. Tier art is
        // served from files.kick.com, which throttles — keep the bundled icon
        // as a fallback the renderer can swap in when a request is dropped.
        const tier = (subBadges || [])
          .filter((b) => b && b.months <= (badge.count ?? 0))
          .sort((a, b) => b.months - a.months)[0];
        fallbackIcon = `${iconBase}badge-subscriber.svg`;
        icon = tier?.badge_image?.src || fallbackIcon;
      } else if (Utils._kickBadgeTypes.includes(badge.type)) {
        icon = `${iconBase}badge-${badge.type}.svg`;
      }

      items.push({ sort: badge.sort_order, icon, fallbackIcon, label: badge.text || badge.type });
    });

    // A missing sort_order sorts last. The sort is stable, so ties keep the
    // badges_v2 entries ahead of the role badges.
    const order = (value) => (typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER);

    return items
      .sort((a, b) => order(a.sort) - order(b.sort))
      .map(({ icon, fallbackIcon, label }) => {
        const entry = { label: String(label ?? '') };
        if (icon) entry.icon = icon;
        if (fallbackIcon && fallbackIcon !== icon) entry.fallbackIcon = fallbackIcon;
        return entry;
      });
  },

  /* ------------------------------------------------------------ TikTok badges --
   * Self-contained: a widget that wants TikTok badges loads this file and the
   * TikTok Sans font, and nothing else. getTikTokBadges hands back finished DOM
   * elements, so there is no badge CSS to copy and no renderer support code.
   * ---------------------------------------------------------------------------- */

  // credits to vortisRD (the scraped icon urls and chip colors)
  // TikFinity's chat payload names a user's grade, fan-club and moderator badges
  // but ships an image url for none of them — only the top-gifter badge carries
  // its own `url`. These are the icons TikTok itself serves, so the missing three
  // are synthesized from the level in the payload.
  //
  // Icons are bare filenames off `base`; _tikTokIcon joins them. A tier applies
  // from its `min` up to the next tier's, so a level past the last row clamps.
  _tikTokBadgeData: {
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

    // badgeSceneType 10, plain member — the "webcast-va-…-v2" icon set on a flat
    // pill. One color across all tiers; the icon steps every ten levels.
    fan: [
      { min: 1,  icon: "webcast-va-fans_badge_icon_lv1_v2.png~tplv-obj.image",  color: "rgba(255, 94, 58, .5)" },
      { min: 10, icon: "webcast-va-fans_badge_icon_lv10_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
      { min: 20, icon: "webcast-va-fans_badge_icon_lv20_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
      { min: 30, icon: "webcast-va-fans_badge_icon_lv30_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
      { min: 40, icon: "webcast-va-fans_badge_icon_lv40_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" },
      { min: 50, icon: "webcast-va-fans_badge_icon_lv50_v2.png~tplv-obj.image", color: "rgba(255, 94, 58, .5)" }
    ],

    // badgeSceneType 10, subscribed member — the "super fan", the one badge TikTok
    // draws two-tone: a lighter pill behind the text and a darker cap behind the
    // icon, each carrying its own border. See getTikTokSuperFanBadge.
    fanSubscriber: {
      background: "rgba(188, 39, 0, .85)",
      panel: "rgba(122, 10, 0, .85)",
      border: "rgba(214, 122, 64, .95)",
      tiers: [
        { min: 1,  icon: "fans_badge_icon_lv1_v4.png~tplv-obj.image"  },
        { min: 10, icon: "fans_badge_icon_lv10_v4.png~tplv-obj.image" },
        { min: 20, icon: "fans_badge_icon_lv20_v4.png~tplv-obj.image" },
        { min: 30, icon: "fans_badge_icon_lv30_v4.png~tplv-obj.image" },
        { min: 40, icon: "fans_badge_icon_lv40_v4.png~tplv-obj.image" },
        { min: 50, icon: "fans_badge_icon_lv50_v4.png~tplv-obj.image" }
      ]
    },

    // badgeSceneType 6 — the payload supplies this one's icon
    topGifter: { color: "rgba(254, 44, 85, .4)" },

    // badgeSceneType 1. TikTok's #803F3F3F is Android AARRGGBB: alpha 0x80/255.
    mod: {
      icon: "moderater_badge_icon.png~tplv-obj.image",
      color: "rgba(63, 63, 63, .5)"
    }
  },

  // Every metric below is an em multiple of whatever font-size the badge inherits —
  // nothing here sets one. Drop the elements into a container sized the way TikTok
  // sizes its own (13px text gives the 15px pill) and they come out right; rescale
  // that single font-size and the whole badge follows, which is what lets a widget
  // ship no badge CSS at all.
  _tikTokBadgeStyle: {
    font: '"TikTok Sans", system-ui, -apple-system, sans-serif',
    height: '1.154em',                // 15px
    radius: '0.308em',                // 4px
    border: 'max(1px, 0.077em)'       // 1px, and never allowed to vanish sub-pixel
  },

  _tikTokIcon(icon) {
    return Utils._tikTokBadgeData.base + icon;
  },

  // Tiers are listed low to high, so the last one the level clears wins. A level
  // below the first tier means the badge isn't really earned yet.
  _tikTokTier(tiers, level) {
    return typeof level === 'number' ? tiers.filter((t) => level >= t.min).pop() : null;
  },

  _tikTokScene(data, sceneType) {
    return (data?.userBadges || []).find((b) => b && b.badgeSceneType === sceneType) || null;
  },

  // These elements are handed out fully built, so there is no widget-side image
  // guard to fall back on: a dropped CDN request has to leave the pill and its text
  // rather than a broken-image glyph.
  _tikTokBadgeIcon(src, css) {
    const img = document.createElement('img');
    img.alt = '';
    img.style.cssText = css;
    img.onerror = () => img.remove();
    img.src = src;
    return img;
  },

  // Grade, plain fan club, top gifter and moderator: a flat one-toned pill with the
  // icon contained inside it, beside the text. Deliberately not the super fan's
  // shape — TikTok gives only that one the two-tone cap and the borders.
  _buildTikTokChip({ icon, text, label, background }) {
    const style = Utils._tikTokBadgeStyle;

    const badge = document.createElement('div');
    if (label) badge.title = label;
    badge.style.cssText = [
      'display:inline-flex', 'align-items:center', 'justify-content:center',
      'box-sizing:border-box', `height:${style.height}`,
      'padding:0 0.231em', 'gap:0.15em',
      `border-radius:${style.radius}`, `background:${background}`,
      `font-family:${style.font}`, 'font-weight:700', 'line-height:1',
      'color:#fff', 'white-space:nowrap', 'vertical-align:middle', 'user-select:none'
    ].join(';');

    badge.appendChild(Utils._tikTokBadgeIcon(icon, 'height:0.831em;width:auto;display:block'));

    // No text means no gap and no span — the padding closes up around the icon.
    if (text) {
      const span = document.createElement('span');
      span.textContent = text;
      badge.appendChild(span);
    }

    return badge;
  },

  // The one badge TikTok draws differently: the icon breaks out above the pill and
  // sits on a darker cap panel, and the pill and the panel each carry their own
  // border. Everything is positioned in em off the pill, so it rescales with the
  // inherited font-size exactly like the flat chips do.
  getTikTokSuperFanBadge(data, { fansClubName = '' } = {}) {
    const style = Utils._tikTokBadgeStyle;
    const theme = Utils._tikTokBadgeData.fanSubscriber;

    const fan = Utils._tikTokScene(data, 10);
    const tier = fan && Utils._tikTokTier(theme.tiers, fan.level);
    if (!tier) return null;

    const text = String(fansClubName || '');

    const badge = document.createElement('div');
    badge.title = `Fan level ${fan.level}`;
    badge.style.cssText = [
      'position:relative', 'display:inline-flex', 'align-items:center',
      'box-sizing:border-box', `height:${style.height}`,
      // The left padding is the well the icon sits in. With no club name to show
      // there is nothing to pad for, so it closes up to just past the icon.
      text ? 'padding:0 0.231em 0 2.308em' : 'padding:0 0 0 2.05em',
      `border:${style.border} solid ${theme.border}`,
      `border-radius:${style.radius}`, `background:${theme.background}`,
      'overflow:visible', `font-family:${style.font}`, 'line-height:1',
      'color:#fff', 'white-space:nowrap', 'vertical-align:middle', 'user-select:none'
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:absolute', 'left:-0.077em', 'top:-0.077em',
      'width:2.154em', `height:${style.height}`, 'box-sizing:border-box',
      `border:${style.border} solid ${theme.border}`,
      `border-radius:${style.radius}`, `background:${theme.panel}`, 'z-index:0'
    ].join(';');

    const icon = Utils._tikTokBadgeIcon(Utils._tikTokIcon(tier.icon), [
      'position:absolute', 'left:0.077em', 'top:-0.077em',
      'width:1.846em', 'height:1.308em', 'object-fit:contain', 'z-index:1'
    ].join(';'));

    badge.append(panel, icon);

    if (text) {
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText = [
        'position:relative', 'z-index:1', 'font-weight:700',
        'letter-spacing:0.015em', 'white-space:nowrap',
        'transform:scaleX(0.94)', 'transform-origin:left center'
      ].join(';');
      badge.appendChild(span);
    }

    return badge;
  },

  getTikTokGradeBadge(data) {
    const grade = Utils._tikTokScene(data, 8);
    const tier = grade && Utils._tikTokTier(Utils._tikTokBadgeData.grade, grade.level);
    if (!tier) return null;

    return Utils._buildTikTokChip({
      icon: Utils._tikTokIcon(tier.icon),
      text: String(grade.level),
      label: `Level ${grade.level}`,
      background: tier.color
    });
  },

  // The chip's text is the club's name, which the payload never carries — it comes
  // from the widget's own settings. Without it the icon stands alone. A subscribed
  // member is a "super fan" and gets its own shape entirely.
  getTikTokFanBadge(data, { fansClubName = '' } = {}) {
    if (data?.isSubscriber) return Utils.getTikTokSuperFanBadge(data, { fansClubName });

    const fan = Utils._tikTokScene(data, 10);
    const tier = fan && Utils._tikTokTier(Utils._tikTokBadgeData.fan, fan.level);
    if (!tier) return null;

    return Utils._buildTikTokChip({
      icon: Utils._tikTokIcon(tier.icon),
      text: fansClubName ? String(fansClubName) : '',
      label: `Fan level ${fan.level}`,
      background: tier.color
    });
  },

  // The only badge whose art the payload ships. Its rank lives on the message
  // rather than on the badge.
  getTikTokTopGifterBadge(data) {
    const gifter = Utils._tikTokScene(data, 6);
    if (!gifter || !gifter.url) return null;

    return Utils._buildTikTokChip({
      icon: gifter.url,
      text: data.topGifterRank > 0 ? `No. ${data.topGifterRank}` : '',
      label: 'Top gifter',
      background: Utils._tikTokBadgeData.topGifter.color
    });
  },

  // Announced twice — as a scene-1 badge and as a top-level flag — and not always
  // both, so take either.
  getTikTokModBadge(data) {
    if (!data || (!data.isModerator && !Utils._tikTokScene(data, 1))) return null;

    return Utils._buildTikTokChip({
      icon: Utils._tikTokIcon(Utils._tikTokBadgeData.mod.icon),
      label: 'Moderator',
      background: Utils._tikTokBadgeData.mod.color
    });
  },

  // Returns finished DOM elements rather than descriptors, in the order TikTok
  // paints them — grade, fan club, top gifter, mod — which is not the order they
  // arrive in. Append them and you're done.
  //
  // Build a fresh set per message: these are live nodes, so reusing one array across
  // messages moves the badges to the newest one instead of copying them.
  getTikTokBadges(data, { fansClubName = '' } = {}) {
    if (!data) return [];

    return [
      Utils.getTikTokGradeBadge(data),
      Utils.getTikTokFanBadge(data, { fansClubName }),
      Utils.getTikTokTopGifterBadge(data),
      Utils.getTikTokModBadge(data)
    ].filter(Boolean);
  },

  // Kick sends raw message text with its own emotes inlined as `[emote:id:name]`
  // markers and 7TV emotes left as bare words. Tokenise once and escape each
  // literal run as we go — regex-replacing the whole string and then
  // word-matching the result would run the second pass over the HTML the first
  // pass just inserted.
  getKickMessageHtml(content, emoteMap = null) {
    const text = String(content ?? '');
    const pattern = /\[emote:(\d+):([^\]]*)\]/g;

    let html = '';
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      html += Utils.getKickTextHtml(text.slice(cursor, match.index), emoteMap);

      // The id is digits-only by the pattern, so it is safe in the url.
      const label = Utils.escapeHtml(match[2]);
      html += `<img src="https://files.kick.com/emotes/${match[1]}/fullsize" alt="${label}" title="${label}" class="emote">`;
      cursor = pattern.lastIndex;
    }

    return html + Utils.getKickTextHtml(text.slice(cursor), emoteMap);
  },


  // Escapes a run of plain message text, swapping in any word that names a 7TV
  // emote. Splitting on a capturing group keeps the separators, so runs of
  // spaces and newlines survive instead of collapsing to one space.
  getKickTextHtml(text, emoteMap = null) {
    if (!text) return '';
    if (!emoteMap || !emoteMap.size) return Utils.escapeHtml(text);

    return text.split(/(\s+)/).map((token) => {
      const url = emoteMap.get(token);
      if (!url) return Utils.escapeHtml(token);

      const label = Utils.escapeHtml(token);
      return `<img src="${Utils.escapeHtml(url)}" alt="${label}" title="${label}" class="emote">`;
    }).join('');
  },

  // credits to vortisRD
  // Builds a name -> url map of every 7TV emote usable in a Kick channel.
  // Resolves against Kick's numeric user id (from getKickIds), not the channel
  // or chatroom id. Any failure degrades to whatever loaded, so a 7TV outage
  // costs you 7TV emotes rather than the whole chat.
  async getKick7TVEmotes(kickUserId) {
    const emotes = new Map();

    const load = async (url, label) => {
      try {
        const response = await fetch(url);

        // A channel with no linked 7TV account 404s here — that's expected.
        if (!response.ok) {
          console.debug(`[getKick7TVEmotes] No ${label} emote set (HTTP ${response.status})`);
          return;
        }

        const data = await response.json();
        const list = data?.emote_set?.emotes || data?.emotes || [];

        list.forEach((emote) => {
          if (emote?.name && emote?.id) {
            emotes.set(emote.name, `https://cdn.7tv.app/emote/${emote.id}/1x.webp`);
          }
        });

      } catch (err) {
        console.error(`[getKick7TVEmotes] Failed to load the ${label} emote set:`, err.message);
      }
    };

    // Globals first, so the channel's own set wins a name collision.
    await load('https://7tv.io/v3/emote-sets/global', 'global');
    if (kickUserId) await load(`https://7tv.io/v3/users/kick/${encodeURIComponent(kickUserId)}`, 'channel');

    return emotes;
  },

  // Escapes text before it goes into innerHTML
  escapeHtml(value) {
    const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, (char) => chars[char]);
  },

  // credits to vortisRD
  // Builds an HTML string from Twitch's structured `data.parts`. Prefer this
  // over regex-replacing `data.text` — Twitch has already told us exactly where
  // each emote/cheer sits, so there's nothing to pattern-match and no risk of a
  // replacement landing inside a URL of a previously-inserted tag.
  async getTwitchMessageFromParts(parts, data = null) {
    if (!Array.isArray(parts)) return '';

    return parts.map((part) => {
      if (!part) return '';

      switch (part.type) {
        case 'emote': {
          if (part.source === 'Twemoji') {
            return Utils.escapeHtml(part.text);
          }

          let url = part.imageUrl;
          if (!url) return Utils.escapeHtml(part.text);

          switch (part.source) {
            case '7TVChannel':   url = url.replace('/4x', '/1x'); break;
            case 'FrankerFaceZ': url = url.replace('/4', '/1'); break;
            case 'BetterTTV':    url = url.replace('/3x', '/1x'); break;
          }

          const label = Utils.escapeHtml(part.text);
          return `<img src="${Utils.escapeHtml(url)}" alt="${label}" title="${label}" class="emote">`;
        }

        // Cheers were previously dropped (returned ''), which is why a cheer-only
        // message rendered as nothing but the spaces between the cheermotes.
        case 'cheer': {
          if (!part.imageUrl) return Utils.escapeHtml(part.text);

          const label = Utils.escapeHtml(part.text);
          const image = `<img src="${Utils.escapeHtml(part.imageUrl)}" alt="${label}" title="${label}" class="emote">`;

          if (part.bits === undefined || part.bits === null) return image;

          // Only trust a plain hex colour — this value lands in a style attribute.
          const safeColor = /^#[0-9a-f]{3,8}$/i.test(part.color || '') ? part.color : null;
          const style = safeColor ? ` style="color:${safeColor}"` : '';

          return `${image}<span class="bits"${style}>${Utils.escapeHtml(part.bits)}</span>`;
        }

        case 'gif': {
          const url = part.url || part.imageUrl;
          if (!url) return Utils.escapeHtml(part.text);

          // `data` is optional, so fall back to the part's own text rather than
          // throwing when it isn't passed.
          const description = Utils.escapeHtml(String(data?.text ?? part.text ?? '').replace(/[\[\]]/g, ''));
          return `<img class="embedded twitch-giphy-integration" src="${Utils.escapeHtml(url)}" alt="${description}" title="${description}">`;
        }

        default:
          return Utils.escapeHtml(part.text);
      }

    }).join('');
  }
};
