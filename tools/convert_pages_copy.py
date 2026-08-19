"""Per-pair prose for the format-conversion pages.

One entry per slug in `nav_data.CONVERT_PAIRS`, plus one per alias. This file
exists for the same reason `size_pages_copy.py` does, and its own docstring is
blunt about it: six pages of interpolated boilerplate is scaled content and
reads like it. The pairs are not interchangeable — PNG to JPG is a question
about a white background, JPG to PNG is a question about why the file got
bigger, and WebP to anything is a question about software that cannot open the
file at all — so each page answers its own.

Everything here has to be true of what the button actually does:

  * Converting to JPEG fills transparency with a hardcoded #ffffff, in both
    the single-image path and the batch path. There is no matte colour picker,
    so nothing here may imply one.
  * WebP output goes through `canvas.toBlob("image/webp", quality)`, which is
    the browser's *lossy* WebP encoder. There is no lossless WebP path.
  * An animated WebP or GIF is drawn through an <img> onto a canvas, which
    yields one frame. Say so rather than letting someone find out.

Fields:

    lede      the line under the h1
    facts     extra (term, value) rows under the "at a glance" list
    why       (h2, [paragraphs]) — the body, specific to this pair
    faq       three (question, answer) pairs, rendered as h3/p and as
              FAQPage JSON-LD
    related   other slugs in the family, most relevant first
"""

COPY = {
    # ------------------------------------------------------------ png -> jpg
    "png-to-jpg": {
        "lede": "Turn a PNG into a JPG in your browser. Photographs get dramatically smaller; transparent areas are filled white, because JPEG has no alpha channel.",
        "facts": [
            ("Compression", "Lossless in, lossy out — the conversion is permanent"),
            ("Transparency", "Not supported by JPEG; transparent pixels are filled with white"),
            ("Typical result", "Much smaller for photographs, often larger for flat colour and text"),
        ],
        "why": ("Why a PNG is so big, and when JPG is the right answer", [
            "PNG stores every pixel exactly. That is the whole point of it, and it is why a screenshot of a spreadsheet stays crisp forever — but it also means a photograph saved as PNG carries the full cost of all that detail, frequently five to ten times the size of the same picture as a JPEG. If something rejected your upload for being too large, or a page is slow because it is loading photographs as PNGs, this is the conversion that fixes it.",
            "JPEG is lossy: the encoder throws information away and cannot put it back. For a photograph that is a bargain, because the detail it discards is detail your eye was not using. For a screenshot, a logo, a diagram or anything with hard edges between flat colours it is a bad trade — JPEG produces visible fringing around sharp edges and around text, and no quality setting removes it entirely. Keep those as PNG, or send them to <a href=\"/png-to-webp\">WebP</a>, which handles both kinds of image well.",
            "Transparency is the other thing to know before you press the button. JPEG has no alpha channel at all, so anything see-through in your PNG has to become something. This tool fills it with white — a fixed white, not a colour you pick — before drawing the image, in the single-image path and in the batch path alike. If your PNG is a logo meant to sit on a dark background, the JPG will have a white box around it, and the fix is to keep it as a PNG rather than to convert it.",
            "The quality slider under the format select is the JPEG quality, and 85 is a sensible place to stay. Everything runs on your own machine — the file is decoded, drawn to a canvas and re-encoded in this tab, and nothing is uploaded to anything.",
        ]),
        "faq": [
            ("Why did my transparent background turn white?",
             "Because JPEG cannot store transparency. It has no alpha channel, so every pixel has to be some colour, and a converter has to choose one. This one fills with white before drawing the image, and that white is fixed in the code rather than being an option — there is no matte colour to pick. If the transparency matters, convert to <a href=\"/png-to-webp\">WebP</a> instead, which keeps the alpha channel and is still far smaller than the PNG."),
            ("How much smaller will the JPG be?",
             "For a photograph, usually somewhere between a fifth and a tenth of the PNG, which is the reason to do this at all. For a screenshot, a chart or a logo the saving is much less dramatic and the JPG is sometimes bigger than the PNG was, because JPEG's compression is built around the gradual variation of a photograph and works badly on large flat areas. The tool shows you the new size as soon as it has encoded, so you can check before downloading."),
            ("Does converting lose quality?",
             "Yes, once, and permanently. The PNG is a perfect record; the JPG is an approximation of it, and converting the JPG back to PNG later cannot recover what was discarded. Keep the PNG as your master and treat the JPG as the copy you send somewhere. The quality slider controls how much is discarded — 85 to 90 is close to invisible on a photograph, and below about 70 the artefacts start to show on flat areas and edges."),
        ],
        "related": ["png-to-webp", "jpg-to-png", "webp-to-jpg"],
    },
    # ------------------------------------------------------------ jpg -> png
    "jpg-to-png": {
        "lede": "Turn a JPG into a PNG in your browser. The result is lossless from here on — but it cannot recover the detail JPEG already discarded, and it will almost certainly be a larger file.",
        "facts": [
            ("Compression", "Lossy in, lossless out — no further loss, and no recovery either"),
            ("Transparency", "PNG supports it; a JPG has none to carry over"),
            ("Typical result", "Two to five times the size of the JPG"),
        ],
        "why": ("What converting to PNG does and does not do", [
            "This is the conversion people most often expect to be an upgrade, so it is worth being direct: converting a JPG to a PNG does not improve the image. JPEG discarded information when the file was first saved, and that information is gone. What a PNG gives you is a promise about the future — from this point on, every save is exact, and the artefacts already baked in will not compound with each round trip the way they do when you re-save a JPEG.",
            "That is a real reason to do it. If you are about to edit a photo across several sessions, or hand it to a tool that re-saves on every operation, working in PNG stops each pass from degrading the picture further. It is also simply what some software demands: plenty of print workflows, icon pipelines, game engines and document templates accept PNG and refuse JPEG, and no amount of renaming the extension changes what is inside the file.",
            "The third reason is transparency. A JPG has no alpha channel, so nothing is transparent in the file you are converting — but PNG has one, so once it is a PNG you can go and erase a background in an editor and the result will keep it. The conversion itself will not remove anything; it hands you a format that can hold the change you are about to make.",
            "Expect the file to grow, often by a factor of two to five. PNG's compression is lossless and cannot approach what JPEG achieves on photographic content, and the JPEG artefacts themselves add fine noise that PNG then has to store faithfully. Everything runs in this tab — the JPG is decoded, drawn to a canvas and re-encoded locally, and nothing is uploaded.",
        ]),
        "faq": [
            ("Will converting to PNG improve the quality?",
             "No. The detail JPEG discarded is not stored anywhere in the file, so nothing can bring it back — the PNG is a perfect copy of an imperfect image. What it does buy you is that no further quality is lost from here on, which matters if the file is about to be edited and re-saved several times. If you still have the original camera file or the original export, converting that is better than converting the JPG."),
            ("Why is the PNG so much bigger than the JPG was?",
             "Because it is lossless. JPEG gets its size by throwing away detail your eye is unlikely to miss; PNG has to store every pixel exactly as it finds it, including the fine JPEG artefacts, which look like noise to a lossless compressor and compress badly. Two to five times the original is normal for a photograph. For a screenshot that was wrongly saved as JPEG in the first place, the PNG can actually come out smaller."),
            ("Does this add transparency to my image?",
             "No. It gives you a format that supports transparency; it does not create any. Every pixel in the resulting PNG is fully opaque, exactly as it was in the JPG. To actually make part of the image see-through you need an editor with a background-removal or eraser tool — converting first is the step that makes the result possible to save."),
        ],
        "related": ["png-to-jpg", "webp-to-png", "jpg-to-webp"],
    },
    # ----------------------------------------------------------- webp -> jpg
    "webp-to-jpg": {
        "lede": "Turn a WebP into a JPG in your browser, so it opens in software that has never heard of WebP. Transparent areas are filled white, because JPEG has no alpha channel.",
        "facts": [
            ("Compression", "Lossy in, lossy out — a second re-encode, so keep the quality high"),
            ("Transparency", "A WebP may have it; JPEG cannot, so it is filled with white"),
            ("Animation", "Not carried over — an animated WebP converts as its first frame"),
        ],
        "why": ("Why you ended up with a WebP you cannot open", [
            "You almost certainly did not choose this format. WebP is what a great many websites now serve, so saving a picture out of a browser hands you a .webp whether you wanted one or not — and then Word refuses it, the print shop's uploader refuses it, an older Photoshop refuses it, and the shared drive shows a blank thumbnail. JPEG is the format nothing refuses, which is why this conversion exists.",
            "Both formats are lossy, so this is a second re-encode of an image that has already been through one. In practice that is fine at a sensible quality setting — the artefacts a good WebP encoder leaves are the kind JPEG also finds cheap to represent — but it is a real cost, so leave the quality slider at 85 or above unless file size is the actual problem. Converting the same file back and forth repeatedly will visibly degrade it.",
            "If the WebP has transparency, it will not survive. JPEG has no alpha channel, so this tool fills transparent pixels with a fixed white before drawing, in both the single-image and batch paths. When the transparency matters — a logo, a sticker, a cut-out product shot — <a href=\"/webp-to-png\">convert to PNG instead</a>, which keeps it exactly.",
            "One more limit worth knowing up front: an animated WebP goes through an image element and a canvas here, which yields a single frame. You will get the first frame as a still JPG, not an animation, and no browser-side canvas conversion can do otherwise. Everything runs locally in this tab and nothing is uploaded.",
        ]),
        "faq": [
            ("Why will nothing open my WebP file?",
             "Because support for it arrived late in desktop software even though every current browser has had it for years. Windows Photos and macOS Preview handle WebP now, but Office, many print and photo-lab uploaders, older Adobe releases and a great deal of line-of-business software still do not. JPEG has been universally readable for three decades, which is why converting is usually faster than persuading the other end to update."),
            ("Will the JPG look worse than the WebP?",
             "Slightly, because it is a second lossy encode of an image that was already lossy. At quality 85 to 90 the difference is very hard to see on a photograph. Where you will notice it is on flat colour and text — screenshots, UI captures, diagrams — because JPEG puts visible fringing around hard edges. For those, <a href=\"/webp-to-png\">WebP to PNG</a> is the better conversion."),
            ("What happens to an animated WebP?",
             "You get its first frame as a still image. The conversion draws the file through an image element onto a canvas and re-encodes what is on the canvas, and a canvas holds one frame — so animation cannot survive this route at all, in this tool or in any other browser-side converter built the same way. Converting an animation properly needs a video or GIF encoder, which this site does not ship."),
        ],
        "related": ["webp-to-png", "png-to-jpg", "jpg-to-webp"],
    },
    # ----------------------------------------------------------- webp -> png
    "webp-to-png": {
        "lede": "Turn a WebP into a PNG in your browser, keeping any transparency exactly as it is. Universally supported, lossless from here on, and usually a bigger file.",
        "facts": [
            ("Compression", "Lossy in, lossless out — no further loss, and no recovery either"),
            ("Transparency", "Kept — both formats have a real alpha channel"),
            ("Animation", "Not carried over — an animated WebP converts as its first frame"),
        ],
        "why": ("The conversion that keeps the transparency", [
            "This is the right way out of WebP when the image has see-through areas. Both WebP and PNG carry a real alpha channel, so the cut-out edges of a logo, a sticker or a product shot arrive intact, with the same soft anti-aliased edge they had. Converting the same file to <a href=\"/webp-to-jpg\">JPG</a> would flatten all of that onto a white rectangle, because JPEG has no alpha channel at all.",
            "It is also the conversion to choose when the image is a screenshot, a diagram, a chart or anything with text in it. PNG stores hard edges between flat colours perfectly, where any lossy format leaves a faint halo around them. If you are converting a WebP so you can annotate it, paste it into a document or hand it to a designer, PNG is what you want.",
            "What PNG cannot do is undo the WebP. If the WebP was lossy — most WebPs downloaded from websites are — then the detail it discarded is gone, and the PNG is a faithful copy of an image that has already lost something. What you gain is that nothing further is lost, no matter how many times the file is opened and saved after this.",
            "Expect the PNG to be larger, often considerably, because lossless compression cannot match what a lossy encoder achieves on photographic content. And as with any browser-side canvas conversion, an animated WebP yields its first frame only. Everything runs in this tab and nothing is uploaded.",
        ]),
        "faq": [
            ("Does the transparency survive the conversion?",
             "Yes, exactly. WebP and PNG both store a real alpha channel per pixel, so partially transparent edges stay partially transparent and a cut-out stays cut out. This is the main reason to pick PNG over JPG when leaving WebP — a JPG would have to fill every transparent pixel with white, because JPEG has no way to record transparency at all."),
            ("Why is the PNG bigger than the WebP was?",
             "Because WebP is a modern lossy format and PNG is a lossless one. WebP reaches its size by discarding detail; PNG has to record every pixel it is given, including whatever fine noise the WebP encoder left behind. Two to four times the original size is normal for a photograph. For a screenshot or a flat-colour graphic the gap is much smaller, and the PNG is occasionally smaller than the WebP."),
            ("Can it convert an animated WebP?",
             "Only to a still image of the first frame. The file is drawn through an image element onto a canvas, and a canvas holds exactly one frame, so there is nowhere for the remaining frames to go. Every browser-side converter built this way has the same limit. An animated WebP needs a dedicated encoder to become an animated GIF or a video, and this site does not ship one."),
        ],
        "related": ["webp-to-jpg", "jpg-to-png", "png-to-webp"],
    },
    # ----------------------------------------------------------- png -> webp
    "png-to-webp": {
        "lede": "Turn a PNG into a WebP in your browser — much smaller for the web, and unlike JPEG it keeps the transparency.",
        "facts": [
            ("Compression", "Lossless in, lossy out — this is the browser's lossy WebP encoder"),
            ("Transparency", "Kept — WebP has a real alpha channel"),
            ("Typical result", "A quarter to a half the size of the PNG at quality 85"),
        ],
        "why": ("The format that finally replaces the PNG on a web page", [
            "For years the choice for a web image was a bad one: JPEG if it was a photograph and you did not need transparency, PNG if you did and you could live with the file size. WebP is the format that stopped forcing that choice. It compresses photographic content roughly as well as JPEG, it handles flat colour and hard edges far better than JPEG does, and it carries a full alpha channel, so a logo with a soft shadow can be small <em>and</em> transparent.",
            "That last part is what makes this the right conversion for most PNGs headed for a website. A PNG with transparency has no small equivalent in JPEG — converting it there would fill the transparent pixels with white and ruin it — so before WebP the only option was to ship the large PNG. Here you keep the alpha and typically lose half to three quarters of the file size.",
            "Be clear about what kind of WebP this produces. The conversion runs through the browser's canvas encoder, which writes <em>lossy</em> WebP at the quality you choose on the slider. Lossless WebP is a different mode of the format, and no browser exposes it through a canvas, so it is not something this tool can offer. At quality 90 the result is visually indistinguishable from the PNG for almost any photograph; for a screenshot with small text, compare them at 100% before you commit.",
            "Support is no longer a reason to hesitate: every current browser reads WebP, and has since Safari 14 in 2020. The one thing to keep in mind is that WebP is a format for the web, not for handing to other people — plenty of desktop software still refuses it, which is exactly why <a href=\"/webp-to-jpg\">the reverse conversion</a> is one of the most-used pages on this site. Everything runs locally and nothing is uploaded.",
        ]),
        "faq": [
            ("Does WebP keep the transparency from my PNG?",
             "Yes. WebP stores a real per-pixel alpha channel, exactly as PNG does, so soft edges and cut-outs come through unchanged. This is the reason to choose WebP over JPEG for a transparent PNG: JPEG has no alpha channel, so converting there fills every transparent pixel with white and there is no setting that avoids it."),
            ("Is the WebP this produces lossless?",
             "No. It uses the browser's canvas encoder, which writes lossy WebP at the quality you set on the slider. WebP does have a lossless mode, and it is genuinely excellent on screenshots and flat graphics, but no browser exposes it through the canvas API — so a lossless WebP needs a command-line tool such as cwebp. At quality 90 the lossy result is visually identical for almost anything photographic."),
            ("Is it safe to use WebP on a live site?",
             "Yes for a normal audience. Chrome, Edge, Firefox, Opera and Safari have all supported it since Safari 14 shipped in 2020, which covers the overwhelming majority of real traffic. If you must serve something older, use a <code>&lt;picture&gt;</code> element with a JPEG or PNG fallback rather than skipping WebP altogether — the browsers that understand WebP will take it and the rest will take the fallback."),
        ],
        "related": ["jpg-to-webp", "png-to-jpg", "webp-to-png"],
    },
    # ----------------------------------------------------------- jpg -> webp
    "jpg-to-webp": {
        "lede": "Turn a JPG into a WebP in your browser. Typically a quarter to a third smaller at the same visible quality — the single easiest thing you can do to a page full of photographs.",
        "facts": [
            ("Compression", "Lossy in, lossy out — a second re-encode, so keep the quality high"),
            ("Transparency", "Not involved — a JPG has none to carry"),
            ("Typical result", "25–35% smaller than the JPG at a matched quality setting"),
        ],
        "why": ("Why the same photograph is smaller as a WebP", [
            "WebP's lossy mode is built on a newer set of ideas than JPEG's — it predicts each block from its neighbours before encoding the difference, where JPEG encodes every block from scratch — and on ordinary photographic content that consistently buys somewhere around a quarter to a third off the file size at the same visible quality. On a page carrying a dozen photographs that is the difference between a fast page and a slow one, and it costs nothing but this conversion.",
            "The honest caveat is that you are re-encoding something that is already lossy. The JPEG artefacts in your file are, as far as the WebP encoder knows, part of the picture, so it spends bits preserving them and then adds a small amount of its own loss on top. Keep the quality slider at 85 or higher and the result will be indistinguishable in normal viewing; push it down to 60 to chase a size target and you will see both generations of damage at once.",
            "Because of that, keep the JPG. Treat it as the master and the WebP as the copy you deploy — if you later need a different size or a different crop, going back to the JPG and re-converting gives a better result than editing the WebP. Where you have the original camera file or the original export, converting that instead of the JPG skips a generation of loss entirely.",
            "No transparency is involved in this direction, since a JPG has none, so nothing can be lost there. If your source has transparency it is not a JPG, and <a href=\"/png-to-webp\">PNG to WebP</a> is the page you want. Everything runs locally in this tab and nothing is uploaded.",
        ]),
        "faq": [
            ("How much smaller will the WebP actually be?",
             "Around 25 to 35% for a typical photograph at a matched quality setting, and the tool shows you the exact number as soon as it has encoded so you never have to take that on trust. The range is wide because it depends on the picture: images with lots of smooth gradient — skies, skin, studio backdrops — do best, while very noisy or heavily textured images narrow the gap considerably."),
            ("Will re-encoding make it look worse?",
             "A little, and how much depends entirely on the quality setting. This is a second lossy pass, so the JPEG's existing artefacts are preserved and a small amount of new loss is added on top. At 85 to 90 that is invisible in normal viewing. The failure case is chasing a small file: at low quality settings you see the JPEG's blocking and WebP's smoothing at the same time, which looks worse than either format alone at that size."),
            ("Should I keep the original JPG?",
             "Yes. Keep the JPG as your master and publish the WebP. Every lossy re-encode costs a little quality, so if you later need a crop, a resize or a different quality target, going back to the JPG and converting again is better than editing the WebP you already made. Better still, if you have the original camera file or the untouched export, convert that and skip a generation entirely."),
        ],
        "related": ["png-to-webp", "webp-to-jpg", "jpg-to-png"],
    },
}

# Alias pages: the same question under a different spelling. These carry
# rel=canonical to the real page and stay out of the sitemap, so they exist for
# the visitor who typed the other spelling without competing with their own
# canonical for the query.
ALIAS_COPY = {
    "jpeg-to-png": {
        "lede": "JPEG and JPG are the same format under two spellings, so this is the same conversion as JPG to PNG — lossless from here on, and a larger file.",
        "body": [
            "There is no difference between a .jpeg file and a .jpg file. The format is JPEG, named after the Joint Photographic Experts Group; the three-letter spelling exists because MS-DOS allowed only three characters in a file extension, and it stuck. Windows, macOS, every browser and every image editor treat the two extensions as the same thing, and the bytes inside are identical.",
            "So converting a JPEG to a PNG is exactly the conversion described in full on <a href=\"/jpg-to-png\">JPG to PNG</a>, and that page is the canonical version of this one. The short version: the PNG will be lossless from this point on, it cannot recover the detail JPEG already discarded, it will usually be two to five times the size, and it gives you a format that supports transparency rather than adding any.",
            "The converter above is seeded for it either way. Drop your .jpeg in and the output format is already set to PNG.",
        ],
    },
}
