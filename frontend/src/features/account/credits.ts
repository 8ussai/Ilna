// The open-source software, fonts and AI models Ilna is built on, shown under Settings > Policy.
// The MIT, BSD and Apache licenses ask for this notice; keep it in step with package.json,
// requirements.txt and the fonts in index.html when they change. Names stay in English.

export type Credit = { name: string; by: string; license: string; url: string }

export type CreditGroup = { key: 'site' | 'server' | 'fonts' | 'ai'; items: Credit[] }

export const CREDITS: CreditGroup[] = [
  {
    // shipped to the browser as part of the site
    key: 'site',
    items: [
      { name: 'Blobatar', by: 'Copyright (c) 2026 Alain', license: 'MIT', url: 'https://github.com/Alain00/blobatar' },
      { name: 'React', by: 'Copyright (c) Meta Platforms, Inc. and affiliates', license: 'MIT', url: 'https://github.com/facebook/react' },
      { name: 'i18next', by: 'Copyright (c) 2011-present i18next', license: 'MIT', url: 'https://github.com/i18next/i18next' },
      { name: 'react-i18next', by: 'Copyright (c) 2015-present i18next', license: 'MIT', url: 'https://github.com/i18next/react-i18next' },
      { name: 'perfect-freehand', by: 'Copyright (c) 2021 Stephen Ruiz Ltd', license: 'MIT', url: 'https://github.com/steveruizok/perfect-freehand' },
      { name: 'jsPDF', by: 'Copyright (c) 2010-2025 James Hall, (c) 2015-2025 yWorks GmbH', license: 'MIT', url: 'https://github.com/parallax/jsPDF' },
      { name: 'fflate', by: 'Copyright (c) 2026 Arjun Barrett', license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
      { name: 'fast-png', by: 'Copyright (c) 2015 Michaël Zasso', license: 'MIT', url: 'https://github.com/image-js/fast-png' },
      { name: 'Tailwind CSS', by: 'Copyright (c) Tailwind Labs, Inc.', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
    ],
  },
  {
    // runs on Ilna's server
    key: 'server',
    items: [
      { name: 'FastAPI', by: 'Copyright (c) 2018 Sebastián Ramírez', license: 'MIT', url: 'https://github.com/fastapi/fastapi' },
      { name: 'Uvicorn', by: 'Copyright (c) 2017-present, Encode OSS Ltd.', license: 'BSD-3-Clause', url: 'https://github.com/encode/uvicorn' },
      { name: 'SQLAlchemy', by: 'Copyright 2005-2026 SQLAlchemy authors and contributors', license: 'MIT', url: 'https://github.com/sqlalchemy/sqlalchemy' },
      { name: 'Alembic', by: 'Copyright 2009-2026 Michael Bayer', license: 'MIT', url: 'https://github.com/sqlalchemy/alembic' },
      { name: 'Pydantic', by: 'Copyright (c) 2017 to present Pydantic Services Inc. and individual contributors', license: 'MIT', url: 'https://github.com/pydantic/pydantic' },
      { name: 'Passlib', by: 'Copyright (c) 2008-2020 Assurance Technologies, LLC', license: 'BSD', url: 'https://foss.heptapod.net/python-libs/passlib' },
      { name: 'bcrypt', by: 'The Python Cryptographic Authority', license: 'Apache-2.0', url: 'https://github.com/pyca/bcrypt' },
      { name: 'cryptography', by: 'Copyright (c) Individual contributors', license: 'Apache-2.0 or BSD-3-Clause', url: 'https://github.com/pyca/cryptography' },
      { name: 'python-jose', by: 'Copyright (c) 2015 Michael Davis', license: 'MIT', url: 'https://github.com/mpdavis/python-jose' },
      { name: 'python-multipart', by: 'Andrew Dunham and contributors', license: 'Apache-2.0', url: 'https://github.com/Kludex/python-multipart' },
      { name: 'email-validator', by: 'Joshua Tauberer', license: 'Unlicense', url: 'https://github.com/JoshData/python-email-validator' },
      { name: 'python-dotenv', by: 'Copyright (c) 2014, Saurabh Kumar', license: 'BSD-3-Clause', url: 'https://github.com/theskumar/python-dotenv' },
      { name: 'LangChain', by: 'LangChain, Inc.', license: 'MIT', url: 'https://github.com/langchain-ai/langchain' },
      { name: 'Chroma', by: 'Chroma', license: 'Apache-2.0', url: 'https://github.com/chroma-core/chroma' },
      { name: 'Sentence Transformers', by: 'Copyright 2019 Nils Reimers', license: 'Apache-2.0', url: 'https://github.com/UKPLab/sentence-transformers' },
      { name: 'Transformers', by: 'Copyright 2018- The Hugging Face team', license: 'Apache-2.0', url: 'https://github.com/huggingface/transformers' },
      { name: 'PyTorch', by: 'Copyright (c) 2016- Facebook, Inc. and the PyTorch contributors', license: 'BSD-3-Clause', url: 'https://github.com/pytorch/pytorch' },
      { name: 'faster-whisper', by: 'Copyright (c) 2023 SYSTRAN', license: 'MIT', url: 'https://github.com/SYSTRAN/faster-whisper' },
      { name: 'pypdf', by: 'Copyright (c) 2006-2008, Mathieu Fenniak and contributors', license: 'BSD-3-Clause', url: 'https://github.com/py-pdf/pypdf' },
      { name: 'Unstructured', by: 'Copyright 2022 Unstructured Technologies, Inc.', license: 'Apache-2.0', url: 'https://github.com/Unstructured-IO/unstructured' },
      { name: 'python-pptx', by: 'Copyright (c) 2013 Steve Canny', license: 'MIT', url: 'https://github.com/scanny/python-pptx' },
      { name: 'Pillow', by: 'Copyright (c) 1997-2011 Secret Labs AB, (c) 2010 Jeffrey A. Clark and contributors', license: 'MIT-CMU', url: 'https://github.com/python-pillow/Pillow' },
    ],
  },
  {
    // served by Google Fonts
    key: 'fonts',
    items: [
      { name: 'Inter', by: 'Rasmus Andersson', license: 'SIL Open Font License 1.1', url: 'https://github.com/rsms/inter' },
      { name: 'IBM Plex Sans Arabic', by: 'IBM', license: 'SIL Open Font License 1.1', url: 'https://github.com/IBM/plex' },
      { name: 'Source Serif 4', by: 'Adobe', license: 'SIL Open Font License 1.1', url: 'https://github.com/adobe-fonts/source-serif' },
      { name: 'Noto Naskh Arabic', by: 'Google', license: 'SIL Open Font License 1.1', url: 'https://github.com/notofonts/arabic' },
    ],
  },
  {
    key: 'ai',
    items: [
      { name: 'Qwen3-Embedding-0.6B', by: 'Qwen team, Alibaba Cloud', license: 'Apache-2.0', url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B' },
      { name: 'Whisper large-v3-turbo', by: 'OpenAI', license: 'MIT', url: 'https://github.com/openai/whisper' },
      { name: 'Gemini Flash', by: 'Google (used as an online service)', license: 'Google API Terms of Service', url: 'https://ai.google.dev/gemini-api/terms' },
    ],
  },
]
