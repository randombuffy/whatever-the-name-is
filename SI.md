# Super Intelligence disclosure

NASA Space Apps requires a visible record of where Super Intelligence was used. This file is that record. It is metadata for the submission, not a physics source.

## Model

NVIDIA NIM, OpenAI-compatible chat at `https://integrate.api.nvidia.com/v1/chat/completions`.

- Model: `meta/llama-3.3-70b-instruct`
- Visible watermark: `SI-generated · NVIDIA NIM · Llama 3.3 70B`
- Key: server-side `NVIDIA_API_KEY` only. It is never sent to the browser.

## Where it is used

- Hangar engineer on Design and Plan. The model explains holds the game already computed and may suggest catalog part ids or a call sign. Cadets apply those parts with a button. The reply is watermarked in the UI.
- Code in this repository was written with Super Intelligence assistance (Cursor). Physics, mass, delta-v, power, link, heat, and cost stay in `src/domain`. The model does not replace those calculations.

## Where it is not used

- Images and videos in the game are NASA library stills, Mars 2020 frames, and the shipped 3D models. None of those are SI-generated. Do not watermark NASA media.
- Audio is the Oculus Audio Pack 1, not SI-generated.
- No NASA logos, flags, or mission identifiers are generated.

## Form checkboxes

Select every option that matches this project. Do not select “I did not use SI”.

- **Code and data:** select this. This file, the Credits screen, and the README are the descriptive text and metadata.
- **Images and videos:** do not select unless you later add SI images or video. If you do, they need a visible `SI-generated` watermark and must not carry NASA marks.
- **Audio:** do not select unless you later add SI audio. If you do, say so in the descriptive text and in the file metadata.

If the form also lists chatbots or large language models, select that too. The hangar engineer is that use.

## Credits line

The hangar engineer is SI-generated text from NVIDIA NIM, model meta/llama-3.3-70b-instruct. It explains holds and can suggest catalog parts. Mass, delta-v, power, link, heat, and cost are still computed in the game. No NASA logos or mission marks are generated.
