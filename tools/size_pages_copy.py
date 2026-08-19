# -*- coding: utf-8 -*-
"""Per-page copy for the platform size pages.

Dimensions are NOT here — they live in nav_data.SIZE_PRESETS and are written
into each page by build_size_pages.py, so a number can only ever be wrong in
one place. What is here is the part that cannot be templated: why each platform
picked the size it did, what it does to an image that arrives at a different
one, and what people get wrong.

Per slug:
  lede    -> the sentence under the <h1>
  facts   -> extra rows for the facts list, beyond the pixel size and ratio
  why     -> (heading, [paragraphs]) — the substance
  faq     -> [(question, answer), ...] — also emitted as FAQPage JSON-LD
  related -> slugs worth an in-body link, beyond the chip row
"""

COPY = {

"instagram-post-size": {
 "lede": "The square feed post, at the size Instagram stores rather than the one it shows.",
 "facts": [("Also accepted", "1080 × 1350 px portrait, 1080 × 566 px landscape"), ("Max upload", "30 MB")],
 "why": ("Why 1080 × 1080 and not larger", [
   "Instagram caps the long edge of a feed image at 1080 pixels. Upload a 4000-pixel square and it is resampled down to 1080 on Instagram's servers, with Instagram's own compression settings and no say from you — which is where the mushy, over-sharpened look of a re-compressed photo comes from. Sending exactly 1080 × 1080 means the only resample that happens is the one you controlled.",
   "The square is the safe default rather than the best-performing one. Portrait at 1080 × 1350 takes up more vertical space in the feed and is what most accounts post now; landscape at 1080 × 566 is the least screen the feed will give you. All three sit inside the same 1080-pixel width ceiling, so a square is the shape that survives being cropped into a grid tile, a story reshare and a profile preview without losing anything at the edges.",
   "One caveat about the grid: the profile grid itself now shows a 4:5 portrait crop of each post rather than a square, so a square image is trimmed at the top and bottom there. Keep anything that must stay visible — a face, a price, a logo — away from the outer few percent of the frame.",
 ]),
 "faq": [
  ("Does Instagram compress my image anyway?", "Yes — it re-encodes uploads to its own JPEG settings. What you control is whether it also has to resize first. Arriving at exactly 1080 pixels wide means only one lossy step happens instead of two."),
  ("Should I post square or portrait?", "Portrait at 1080 × 1350 occupies more of the screen in the feed, which is why most accounts use it. Square is safer if the same image has to work as a grid tile, an ad and a profile preview."),
 ],
 "related": ["instagram-story-size", "instagram-reel-size", "instagram-profile-picture-size"],
},

"instagram-story-size": {
 "lede": "Full-screen vertical, sized so Instagram's own interface does not cover the part that matters.",
 "facts": [("Aspect", "9:16, the full phone screen"), ("Safe area", "roughly 250 px clear at the top and 250 px at the bottom")],
 "why": ("Why 1080 × 1920, and where the UI lands", [
   "A story fills the phone screen edge to edge, and modern phones are taller than 16:9 — so the image is scaled to the screen width and the extra height is cropped, or letterboxed with a blurred backdrop. 1080 × 1920 is the size Instagram publishes and the one that needs the least of that.",
   "The number that actually decides whether a story works is not the canvas size but the safe area. Your profile picture, name and the close button sit across the top; the reply box, share and menu controls sit across the bottom. Roughly the top 250 and bottom 250 pixels of a 1920-pixel canvas are covered by chrome at some point, and on a taller phone the crop eats into them further. Design as though the usable frame is the middle 1080 × 1420.",
   "Text is the thing that suffers. A caption placed 100 pixels from the bottom looks fine in your design tool and sits underneath the reply box on a real phone. If a story has a call to action, put it in the middle third, not the last sixth.",
 ]),
 "faq": [
  ("Why does my story look zoomed in?", "Because the phone screen is taller than 9:16 and Instagram scales the image to fill the width, cropping the top and bottom. Keeping important content out of the outer 250 pixels is what prevents it."),
  ("Is a story the same size as a reel?", "The canvas is — both are 1080 × 1920. What differs is what covers it: a reel carries a caption, a sound credit and a column of buttons up the right-hand side, so its usable middle is narrower."),
 ],
 "related": ["instagram-reel-size", "tiktok-video-size", "instagram-post-size"],
},

"instagram-reel-size": {
 "lede": "The reel canvas and its cover frame, at the vertical size the feed expects.",
 "facts": [("Aspect", "9:16"), ("Grid crop", "the cover is shown as a 1:1 square on the profile grid")],
 "why": ("Why a reel cover needs two compositions at once", [
   "A reel is 1080 × 1920 like a story, but a cover image has a second job a story never has: it is the tile people see on your profile grid, and the grid crops it. The full vertical frame appears in the feed, while the grid shows a centre crop. An image composed to look right full-screen usually has its subject too high or too low to survive that crop.",
   "The right way to build one is to lay out the 9:16 canvas, then mark the centre square and keep the face, the product or the headline inside it. Anything outside that square is decoration that only feed viewers get to see.",
   "The rest of the frame is spoken for too. Captions and the sound credit sit across the bottom of a reel and the like, comment, share and menu buttons run up the right side, so the bottom fifth and the right eighth of the canvas are borrowed by Instagram. Text that lands there is not covered on your machine and is covered on everyone else's.",
 ]),
 "faq": [
  ("Can I upload a cover that is not 9:16?", "You can, and Instagram will letterbox or crop it. Since the cover has to serve both the vertical feed and the square grid tile, starting at 1080 × 1920 and composing for the centre square gives you both without a second export."),
  ("Does the cover need to be a frame from the video?", "No. You can upload a separate image, which is what lets you put readable text on the cover — a still lifted from the video rarely has anywhere clear to put it."),
 ],
 "related": ["instagram-story-size", "tiktok-video-size", "instagram-post-size"],
},

"instagram-profile-picture-size": {
 "lede": "The square avatar, at the size Instagram actually stores it at.",
 "facts": [("Displayed at", "about 110 px on mobile, 150 px on the web"), ("Shape", "square file, masked to a circle")],
 "why": ("Why 320 × 320 is enough — and why to upload more", [
   "Instagram stores profile pictures at 320 × 320 and displays them far smaller: roughly 110 pixels in the app and 150 on the web. Anything larger than 320 is discarded. That makes this one of the few sizes on the site where the ceiling is genuinely low, and where a 4000-pixel logo file gains you nothing at all.",
   "The rule that matters more than the pixel count is the mask. The file is square and the display is a circle, so the corners are cut off — about 21 percent of the area of a square is outside its inscribed circle. A logo that fills its square edge to edge loses its corners; a wordmark set across the full width loses its first and last letters.",
   "At 110 pixels, detail disappears. A full company wordmark is unreadable at that size, which is why almost every brand avatar is a monogram, an icon or a face. Build the mark inside a circle drawn at 320 pixels, then look at it at 110 before you upload it — if it does not read there, no amount of resolution will help.",
 ]),
 "faq": [
  ("Should I upload something bigger than 320 × 320?", "Uploading a somewhat larger square is harmless and gives Instagram a cleaner source to downsample, but nothing above 320 is stored. What matters is that it is square and that the subject sits inside the circle."),
  ("Why does my logo look cut off?", "Because the square is masked to a circle. Leave a margin of roughly 10 percent on all four sides and nothing lands in the trimmed corners."),
 ],
 "related": ["discord-server-icon-size", "spotify-playlist-cover-size", "instagram-post-size"],
},

"youtube-thumbnail-size": {
 "lede": "The custom thumbnail, at the 16:9 size YouTube asks for and under the file cap it enforces.",
 "facts": [("Minimum width", "640 px"), ("Max file size", "2 MB"), ("Formats", "JPG, PNG, GIF or WebP")],
 "why": ("Why 1280 × 720, and why the 2 MB cap bites", [
   "1280 × 720 is YouTube's recommended thumbnail size and the resolution the player uses for a full-width preview. The absolute minimum accepted width is 640 pixels, but a 640-pixel thumbnail is visibly soft the moment it is shown at any size above a search result row, and it is the same file that has to serve a phone-sized list item and a television home screen.",
   "The constraint people hit is not the dimensions but the 2 MB limit. A 1280 × 720 photograph exported as a maximum-quality PNG runs well past that, and YouTube rejects it outright rather than compressing it for you. The fix is either a JPEG at high quality — which lands comfortably under 500 KB at this size — or a PNG only when the design is flat colour and text, where PNG is both smaller and sharper.",
   "The other thing worth knowing is how small it gets seen. A thumbnail in a mobile search result is a couple of hundred pixels wide. Detail vanishes; contrast and one large focal element survive. Build it at 1280 × 720 so it holds up on a TV, but judge it at 320 pixels wide, which is where most of the decisions to click are actually made.",
 ]),
 "faq": [
  ("Why was my thumbnail rejected?", "Almost always the 2 MB file size limit, or an unsupported format. Re-export as a JPEG — a photographic thumbnail at this size fits well under the cap without visible loss."),
  ("Does a bigger thumbnail rank better?", "No. Above 1280 × 720 you are only sending YouTube pixels it will throw away. Legibility at small sizes is the thing that changes the click-through rate."),
 ],
 "related": ["youtube-banner-size", "twitch-offline-banner-size", "twitter-post-image-size"],
},

"youtube-banner-size": {
 "lede": "Channel art at the full 2560 × 1440 upload, with the safe area that survives every screen.",
 "facts": [("Safe area", "1546 × 423 px, centred"), ("Max file size", "6 MB"), ("Tablet crop", "1855 × 423 px")],
 "why": ("One image, four different crops", [
   "YouTube channel art is the most aggressively cropped image on any major platform. You upload one 2560 × 1440 file and YouTube shows a different rectangle out of it on every device: the full width on a television, roughly 2560 × 423 on a desktop browser, about 1855 × 423 on a tablet, and only the middle 1546 × 423 on a phone.",
   "That last figure is the one that matters. The centred 1546 × 423 region is the only part guaranteed to be visible everywhere, so the channel name, the logo and the upload schedule all have to live inside it. Everything outside is background that only some visitors ever see — which is fine, as long as nothing there is load-bearing.",
   "Because a television can display the whole 2560 × 1440, the outer area still needs to look deliberate rather than like an accident of cropping. The usual approach is a plain or gradient background across the full canvas with the content grouped in the safe rectangle. Keep the export under the 6 MB limit; at this size a JPEG is the sensible choice unless the art is flat colour.",
 ]),
 "faq": [
  ("Why is my banner cut off on mobile?", "Because the phone view shows only the central 1546 × 423 pixels. Anything outside that rectangle is cropped away on the device most of your viewers use."),
  ("Can I upload something smaller than 2560 × 1440?", "YouTube requires at least 2048 × 1152. Going below the recommended size means the television view is upscaled, which is the one place a banner is seen large."),
 ],
 "related": ["youtube-thumbnail-size", "twitch-profile-banner-size", "linkedin-banner-size"],
},

"twitter-header-size": {
 "lede": "The 3:1 profile banner on X, sized so the avatar does not sit on top of anything important.",
 "facts": [("Aspect", "3:1"), ("Max file size", "2 MB (5 MB for GIF)"), ("Formats", "JPG, PNG or GIF")],
 "why": ("Where the avatar and the profile text land", [
   "1500 × 500 is the size X publishes for a profile header, and the 3:1 shape is unusually wide — wider than almost anything else you will export. It is displayed responsively, so on a narrow window the same image is scaled down and the top and bottom edges can be trimmed slightly to keep the ratio.",
   "The complication is everything drawn over it. The circular avatar overlaps the bottom-left corner and, on mobile, the display name and handle sit directly beneath in a way that pushes the visible band upward. Treat the bottom-left quarter as unusable: a logo placed there is behind the profile picture on every view.",
   "Because a header is only ever seen a few hundred pixels tall in practice, fine detail and small text do not survive. A single strong image, a flat colour field or a simple pattern reads better than a composition. Keep the export under the 2 MB cap — easy at this size for a JPEG, less so for a PNG photograph.",
 ]),
 "faq": [
  ("Why does my header look cropped on a phone?", "The header is scaled to the window width and held at 3:1, so a narrower viewport shows a shorter band of it. Content near the top and bottom edges is the first to go."),
  ("Does the avatar overlap the header?", "Yes, at the bottom left. Leave that corner clear or the profile picture sits on top of whatever you put there."),
 ],
 "related": ["twitter-post-image-size", "linkedin-banner-size", "facebook-cover-photo-size"],
},

"twitter-post-image-size": {
 "lede": "The in-timeline image, at the 16:9 size that survives the feed's own crop.",
 "facts": [("Feed crop", "roughly 2:1 for a single image"), ("Max file size", "5 MB (15 MB for GIF)"), ("Formats", "JPG, PNG, WebP or GIF")],
 "why": ("Why the timeline crops your image and what to do about it", [
   "A single image attached to a post is displayed in the timeline at roughly a 2:1 letterbox, and tapping it opens the full frame. So a 16:9 upload is not shown as 16:9 in the feed — the top and bottom are trimmed to fit a wider rectangle, and only people who tap see the whole thing.",
   "1600 × 900 is a good working size because it is large enough that the timeline crop still has plenty of pixels to work with, and small enough to stay well under the 5 MB limit as a JPEG. Uploading much larger gains nothing: X re-encodes anyway.",
   "Compose for the middle band. Put the subject, the headline or the chart's key line in the central half of the frame and treat the top and bottom eighths as bleed. If an image is genuinely tall — a screenshot of a document, a full chart — expect it to be cropped hard in the feed and consider splitting it into two attachments, which are shown side by side instead.",
 ]),
 "faq": [
  ("Which part of my image shows in the timeline?", "Roughly the middle 2:1 band of a single attached image. The full frame appears when someone taps it."),
  ("Should I use PNG or JPEG?", "JPEG for photographs. PNG only for flat-colour graphics and screenshots with text, where the sharper edges are worth the larger file — and it still has to fit under 5 MB."),
 ],
 "related": ["twitter-header-size", "facebook-post-image-size", "linkedin-post-image-size"],
},

"facebook-cover-photo-size": {
 "lede": "The profile and page cover, at the desktop upload size — and what mobile does to it.",
 "facts": [("Mobile display", "about 640 × 360 px, a taller crop"), ("Minimum", "400 × 150 px"), ("Formats", "JPG or PNG (PNG for text and logos)")],
 "why": ("One upload, two different shapes", [
   "The cover photo is the classic example of a platform showing different crops of the same file. On a desktop browser it is displayed as a wide, shallow band around 851 × 315; on a phone the visible area is closer to 640 × 360 — noticeably taller and narrower, cut out of the middle of what you uploaded.",
   "That means the sides of your cover disappear on mobile and the extra height at top and bottom only appears there. The part visible on every device is the centre. Anything critical — a strap line, a phone number, a logo — belongs in the middle of the frame, well inside both crops.",
   "Facebook compresses covers noticeably. For a photograph, a JPEG at this size is fine. For a cover that is mostly text or a logo, upload a PNG: Facebook's own guidance is that a PNG survives its compression better for flat graphics, and the difference on hard edges is easy to see.",
 ]),
 "faq": [
  ("Why does my cover look different on my phone?", "Because the mobile view crops a taller, narrower rectangle from the centre of the same file. The left and right ends of a desktop cover simply are not shown there."),
  ("Why does my text look blurry?", "Facebook re-compresses covers. Text and logos hold up better uploaded as a PNG than as a JPEG at the same dimensions."),
 ],
 "related": ["facebook-post-image-size", "twitter-header-size", "linkedin-banner-size"],
},

"facebook-post-image-size": {
 "lede": "The 1.91:1 feed image — the same shape as an Open Graph preview, which is not a coincidence.",
 "facts": [("Aspect", "1.91:1"), ("Also the OG size", "the standard og:image dimensions"), ("Minimum for links", "600 × 315 px")],
 "why": ("Why 1200 × 630 turns up everywhere", [
   "1200 × 630 is Facebook's recommended size for a shared image and for the preview card generated from a link, and because Facebook's Open Graph tags became the de facto standard for link previews, the same dimensions now show up in LinkedIn, Slack, iMessage, WhatsApp and most chat apps. Export one image at this size and it serves the lot.",
   "The ratio is roughly 1.91:1 — wider than 16:9. An image built at 16:9 and uploaded as a link preview gets its top and bottom shaved, which is the usual reason a carefully centred logo comes out clipped in a shared card.",
   "Below 600 × 315, Facebook falls back to a small square thumbnail beside the text instead of the large card, which is a substantial difference in how much space the link occupies in a feed. That threshold, rather than the recommended size, is the one that changes the layout.",
 ]),
 "faq": [
  ("Is this the same as the Open Graph image size?", "Yes — 1200 × 630 is the standard og:image size, which is why one export covers Facebook, LinkedIn, Slack and most messaging apps."),
  ("What happens if my image is too small?", "Under 600 × 315 the link renders as a small square thumbnail with the text beside it rather than a full-width card."),
 ],
 "related": ["facebook-cover-photo-size", "linkedin-post-image-size", "twitter-post-image-size"],
},


"linkedin-banner-size": {
 "lede": "The 4:1 profile cover, sized around the avatar that sits on top of it.",
 "facts": [("Aspect", "4:1"), ("Max file size", "8 MB"), ("Formats", "JPG, PNG or GIF")],
 "why": ("A very wide strip with a hole punched in it", [
   "1584 × 396 is LinkedIn's size for a personal profile banner, and at 4:1 it is one of the shallowest images any platform asks for — 396 pixels of height to work with across a metre of screen. Company pages use a different, wider shape, so a banner made for one does not transfer to the other.",
   "The profile photo overlaps the banner near the left on desktop and closer to the centre on mobile, and the position genuinely moves between the two layouts. That makes the left third unreliable and the far right the only region that behaves consistently. Most banners that survive both views put their text on the right and keep the left as background.",
   "There is also a crop in play: the banner is displayed responsively and a narrow window shows a shorter band. Combined with the avatar, the safe region is roughly the middle vertical half of the right-hand two thirds. It is a small target, which is why the banners that work are one line of text and a plain field rather than a composition.",
 ]),
 "faq": [
  ("Is a company page banner the same size?", "No. Company pages use their own, wider cover dimensions. A personal banner uploaded there is cropped differently, so export separately for each."),
  ("Why is my text hidden behind my photo?", "The avatar overlaps the banner, and it sits further left on desktop than on mobile. Keeping text to the right of centre is what avoids both positions."),
 ],
 "related": ["linkedin-post-image-size", "twitter-header-size", "facebook-cover-photo-size"],
},

"linkedin-post-image-size": {
 "lede": "The feed image at 1.91:1 — the shape LinkedIn shares with every Open Graph preview.",
 "facts": [("Aspect", "1.91:1"), ("Also works", "1200 × 1200 square, which takes more feed height"), ("Max file size", "5 MB")],
 "why": ("Why 1200 × 627, and when to go square instead", [
   "1200 × 627 is LinkedIn's recommended size for an image in a post and for the card generated from a shared link. It is the Open Graph ratio again — 1.91:1 — so an image built for a Facebook post or a link preview drops straight in.",
   "For a native image post rather than a link, a square at 1200 × 1200 occupies noticeably more vertical space in the feed, and on a phone that is the whole argument: a taller image pushes the surrounding posts off the screen. The trade is that a square does not match the link-preview shape, so if the same asset has to do both jobs, 1.91:1 is the one that works everywhere.",
   "Text on LinkedIn images is common and mostly survives, because the feed renders these at a decent size. It still gets re-compressed, so flat-colour graphics and charts are better uploaded as PNG while photographs stay JPEG.",
 ]),
 "faq": [
  ("Square or landscape for a LinkedIn post?", "Square takes more room in the feed, which usually helps a native image post. Landscape at 1.91:1 is the right choice when the same image is also the link preview."),
  ("Does LinkedIn use the Open Graph image?", "Yes — a shared link's card comes from the page's og:image, which is why 1200 × 630 and 1200 × 627 are effectively the same target."),
 ],
 "related": ["linkedin-banner-size", "facebook-post-image-size", "twitter-post-image-size"],
},

"tiktok-video-size": {
 "lede": "The full-screen vertical frame, and the parts of it TikTok's own interface covers.",
 "facts": [("Aspect", "9:16"), ("Cover crop", "the profile grid shows a taller 1:1.29 slice"), ("Also accepted", "1:1 and 16:9, shown letterboxed")],
 "why": ("The canvas is 1080 × 1920; the usable part is smaller", [
   "TikTok is built around 1080 × 1920, the full portrait screen. Other shapes upload fine and are letterboxed with blurred fill, but they give away screen space in a feed where filling the screen is most of the point.",
   "What makes the size deceptive is the interface. The username, caption and sound name sit across the bottom left; the avatar, like, comment, share and spin-record buttons run up the right; and the search and following tabs sit across the top. On a 1080 × 1920 canvas, the bottom fifth and the right eighth are effectively spoken for, and the phone's own status bar and home indicator take a little more.",
   "So compose inside the middle: roughly 1080 × 1420 with the right eighth left clear. Text placed in the true centre survives every device; text placed at the bottom is behind the caption on most of them, which is the single most common way a carefully made vertical video ends up unreadable.",
 ]),
 "faq": [
  ("Can I upload a landscape video?", "Yes, and TikTok letterboxes it with a blurred backdrop. It works, but it hands over most of the screen in a full-screen feed."),
  ("Why is my text covered by the caption?", "Because the caption, username and sound credit are drawn over the bottom of the frame. Keeping text out of the bottom fifth is what prevents it."),
 ],
 "related": ["instagram-reel-size", "instagram-story-size", "youtube-thumbnail-size"],
},

"pinterest-pin-size": {
 "lede": "The 2:3 standard pin — the shape the feed is built around, and the one it will not truncate.",
 "facts": [("Aspect", "2:3"), ("Max file size", "20 MB"), ("Longer pins", "shown truncated in the feed until tapped")],
 "why": ("Why 2:3 and not taller", [
   "Pinterest's feed is a masonry grid of tall, narrow cards, and 1000 × 1500 — a 2:3 ratio — is the shape it is tuned for. It is tall enough to take up real space in a scrolling column without being so tall that the feed cuts it off.",
   "Taller pins are not rejected, but they are truncated in the feed and only shown in full when someone opens them. That is why the long infographic pin, once a staple, now mostly appears as a cropped middle section with the conclusion cut off. If the point of the pin is at the bottom, most people never see it.",
   "Because pins are browsed at a few hundred pixels wide on a phone, text overlays have to be large. 1000 pixels of width is plenty of resolution for that; the constraint is legibility rather than detail. Export as JPEG for photographs and PNG for flat graphics with text, both comfortably inside the 20 MB cap.",
 ]),
 "faq": [
  ("Can I use a square pin?", "You can, and it will show. It simply occupies less of the column than a 2:3 pin, which is the whole advantage of the taller shape in a masonry feed."),
  ("What happens to a very long infographic?", "It is truncated in the feed. Anyone who does not tap through sees only a middle slice, so the message has to work in the visible part."),
 ],
 "related": ["instagram-story-size", "facebook-post-image-size", "instagram-post-size"],
},

"discord-banner-size": {
 "lede": "The 16:9 profile banner, shown behind the avatar on your Discord profile card.",
 "facts": [("Aspect", "16:9"), ("Formats", "PNG, JPG or GIF (animated needs Nitro)"), ("Displayed", "small — a card, not a page")],
 "why": ("A small banner that is mostly corner", [
   "Discord's profile banner is a 16:9 strip across the top of the profile card, and 960 × 540 is the size that covers it on a high-density screen without wasting bandwidth. It is displayed small — this is a card inside a chat client, not a page header — so fine detail is lost and a single clear image reads best.",
   "The avatar sits over the bottom-left of the banner, a circle roughly a fifth of the banner's width, and the display name and pronouns appear directly beneath. Anything placed at the bottom left is behind the avatar, and the composition that survives is one that keeps its subject centred or right.",
   "The banner is also cropped slightly on the narrower profile popout compared with the full profile view, so the very edges should be treated as bleed rather than content.",
 ]),
 "faq": [
  ("Do I need Nitro for a banner?", "A static profile banner is available without it on most account types; animated GIF banners are a Nitro feature. The dimensions are the same either way."),
  ("Why does my banner look soft?", "Usually because it was uploaded smaller than 960 × 540 and is being scaled up on a high-density display. Going above that size adds nothing."),
 ],
 "related": ["discord-server-icon-size", "twitch-profile-banner-size", "youtube-banner-size"],
},

"discord-server-icon-size": {
 "lede": "The square server icon, masked to a circle in every server list it appears in.",
 "facts": [("Shape", "square file, displayed as a circle"), ("Displayed at", "about 48 px in the server list"), ("Formats", "PNG, JPG or GIF")],
 "why": ("512 pixels stored, 48 pixels seen", [
   "Discord recommends 512 × 512 for a server icon, which sounds generous until you notice where it is displayed: a roughly 48-pixel circle in the left-hand server rail, and not much larger in the discovery list. The 512 exists so the icon stays sharp on high-density displays and in the larger contexts, not because anyone sees it at that size.",
   "The mask is a circle, so the corners of the square are cut away. That removes about a fifth of the area, and it is exactly where a square logo puts its most recognisable edges. Draw the mark inside a circle, leave a margin, and check it against a circular crop before uploading.",
   "At 48 pixels, only shape and colour survive. Servers whose icons work are the ones using a single letter, a simple glyph or a strong silhouette; a detailed illustration becomes a smudge. Test by scaling your icon to 48 pixels and looking at it next to a few others — that is the real viewing condition.",
 ]),
 "faq": [
  ("Does the icon have to be square?", "The file should be square; Discord masks it into a circle. A non-square upload is cropped to square first, usually not where you would have chosen."),
  ("Is 512 × 512 overkill?", "For the server rail, yes — but it is the size Discord stores, and it keeps the icon crisp on high-density screens and in larger listings."),
 ],
 "related": ["discord-banner-size", "instagram-profile-picture-size", "spotify-playlist-cover-size"],
},

"twitch-offline-banner-size": {
 "lede": "The image that fills the player when your channel is not live — the largest thing on the page.",
 "facts": [("Aspect", "16:9"), ("Max file size", "10 MB"), ("Formats", "JPG, PNG or GIF")],
 "why": ("The one Twitch asset that is genuinely displayed large", [
   "The offline banner sits inside the video player, which is the biggest element on a channel page — on a desktop browser it can be over a thousand pixels wide. 1920 × 1080 gives it a full 1080p source, and unlike most social images this one really is seen at close to that size, so detail and text legibility both matter.",
   "It is also the only thing a visitor who arrives while you are offline sees first. That makes it a schedule board rather than decoration: stream times, what the channel plays, and where else to find you. Because the player is 16:9 on every device, this is one of the few uploads that is not cropped differently somewhere else.",
   "What does move is scale. The same banner is shown small in an embedded player and in a channel preview, so text sized comfortably for a desktop player can be unreadable in the smaller contexts. Keep the type large and the layout uncluttered, and stay under the 10 MB limit — easy at 1080p as a JPEG, harder as a PNG photograph.",
 ]),
 "faq": [
  ("Is the offline banner the same as the profile banner?", "No. The offline banner fills the video player at 16:9; the profile banner is a shallow strip across the top of the channel page. They are separate uploads at different sizes."),
  ("Can it be animated?", "A GIF is accepted, but the offline screen is often seen for a long time and a looping animation gets tiring. Most channels use a still."),
 ],
 "related": ["twitch-profile-banner-size", "youtube-banner-size", "discord-banner-size"],
},

"twitch-profile-banner-size": {
 "lede": "The 5:2 strip across the top of a Twitch channel page.",
 "facts": [("Aspect", "5:2"), ("Max file size", "10 MB"), ("Formats", "JPG, PNG or GIF")],
 "why": ("A shallow strip that gets shallower", [
   "1200 × 480 is Twitch's size for the profile banner — the band behind the channel name at the top of the page. At 5:2 it is shallow, and it is displayed responsively, so a narrow browser window shows the same image scaled down rather than a taller slice of it.",
   "The profile picture overlaps the banner on the left and the channel name sits beside it, so the left portion is spoken for. As with most banners, the reliable region is the right half and the vertical middle.",
   "Twitch channels usually carry three separate images — this banner, the offline player screen and the profile picture — and they are all different shapes. It is worth building them from one design at three canvases rather than trying to crop one file into all three, because the offline banner is 16:9 and this is 5:2, and nothing crops cleanly between them.",
 ]),
 "faq": [
  ("How is this different from the offline banner?", "This is the strip at the top of the channel page. The offline banner is the much larger 16:9 image inside the video player when you are not streaming."),
  ("Why does my banner look cropped?", "The band is displayed responsively and the profile picture overlaps its left side. Keeping content in the right half and away from the top and bottom edges avoids both."),
 ],
 "related": ["twitch-offline-banner-size", "youtube-banner-size", "twitter-header-size"],
},

"zoom-virtual-background-size": {
 "lede": "A 1080p 16:9 background, at the size Zoom recommends and most webcams match.",
 "facts": [("Aspect", "16:9"), ("Minimum", "1280 × 720 px"), ("Formats", "JPG, PNG or GIF (24-bit)")],
 "why": ("Why 1920 × 1080, and why the image is mirrored", [
   "Zoom recommends a 16:9 image with a minimum resolution of 1280 × 720, and 1920 × 1080 is the comfortable working size: it matches the aspect ratio of virtually every webcam, so nothing is cropped, and it has enough resolution for a full-screen share on a large display.",
   "The catch that surprises people is mirroring. Zoom mirrors your own video preview by default, so a background containing text or a logo reads backwards to you while appearing correctly to everyone else. Turning off \"Mirror my video\" in the video settings shows what participants actually see — the setting affects your preview only, not what is transmitted.",
   "Composition matters more than resolution here, because you are standing in front of it. The middle of the frame is covered by a person, so a background with its content in the centre is a background nobody can read. Keep logos and text to the outer thirds, and prefer a low-contrast image: Zoom's segmentation cuts you out of your real background in software, and a busy virtual background makes the resulting edge artefacts far more obvious.",
 ]),
 "faq": [
  ("Why does my background text appear backwards?", "Because Zoom mirrors your self-view by default. Other participants see it the right way round; turn off \"Mirror my video\" to preview it as they do."),
  ("Does a higher resolution improve the edge quality?", "No. The ragged outline around your head comes from Zoom's segmentation, not the background's resolution. A simpler, lower-contrast background hides it far better than more pixels do."),
 ],
 "related": ["twitch-offline-banner-size", "youtube-thumbnail-size", "facebook-cover-photo-size"],
},

"spotify-playlist-cover-size": {
 "lede": "The square playlist cover, at the size Spotify asks for and inside its file limit.",
 "facts": [("Minimum", "300 × 300 px"), ("Max file size", "4 MB"), ("Format", "JPEG")],
 "why": ("Square, small, and JPEG only", [
   "Spotify wants a square cover, at least 300 × 300, and 640 × 640 is the size it publishes as the recommendation. The upload has to be a JPEG and must stay under 4 MB, which is why a PNG export — the natural choice for flat artwork with text — is rejected outright rather than converted.",
   "Covers are displayed small in most places: a tile in a grid, a thumbnail in a now-playing bar, a row in a search result. A cover that works is one whose subject survives at about 100 pixels. Album-style artwork with a single strong element beats a detailed collage every time.",
   "Custom covers apply to playlists you own, and replacing one is permanent in the sense that the mosaic of album art Spotify generates by default does not come back once you have set your own. Worth having a version you are happy with before you upload.",
 ]),
 "faq": [
  ("Why was my PNG rejected?", "Spotify accepts JPEG for playlist covers. Convert first — the conversion is lossless in the sense that matters here, since the artwork has to be re-encoded for upload anyway."),
  ("Does a bigger cover look better?", "Not meaningfully. Above 640 × 640 you are sending pixels that are only ever displayed small. Legibility at thumbnail size is what changes."),
 ],
 "related": ["instagram-profile-picture-size", "discord-server-icon-size", "instagram-post-size"],
},
}
