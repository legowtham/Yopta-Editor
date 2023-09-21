import { Inter } from 'next/font/google';
import { useState } from 'react';
import YooptaEditor from '@yoopta/editor';

import Paragraph from '@yoopta/paragraph';
import Blockquote from '@yoopta/blockquote';
import Code from '@yoopta/code';
import Embed from '@yoopta/embed';
import Image from '@yoopta/image';
import Link from '@yoopta/link';
import Callout from '@yoopta/callout';
import Video from '@yoopta/video';
import { NumberedList, BulletedList, TodoList } from '@yoopta/lists';
import { Bold, Italic, CodeMark, Underline, Strike } from '@yoopta/marks';
import { HeadingOne, HeadingThree, HeadingTwo } from '@yoopta/headings';

import { uploadToCloudinary } from '@/utils/cloudinary';
import { yooptaInitData, YooptaValue } from '@/utils/initialData';

const inter = Inter({ subsets: ['latin'] });

const plugins = [
  Paragraph,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  Blockquote,
  Callout,
  Code,
  Link,
  NumberedList,
  BulletedList,
  TodoList,
  Embed.extend({
    options: {
      maxWidth: 650,
      maxHeight: 750,
    },
  }),
  Image.extend({
    options: {
      maxWidth: 650,
      maxHeight: 650,
      onUpload: async (file: File) => {
        const response = await uploadToCloudinary(file, 'image');
        return { url: response.url, width: response.data.width, height: response.data.height };
      },
    },
  }),
  Video.extend({
    options: {
      maxWidth: 650,
      maxHeight: 650,
      onUpload: async (file: File) => {
        const response = await uploadToCloudinary(file, 'video');
        return { url: response.url, width: response.data.width, height: response.data.height };
      },
    },
  }),
];

export default function Home() {
  const [editorValue, setEditorValue] = useState<YooptaValue[]>(yooptaInitData);

  const marks = [Bold, Italic, CodeMark, Underline, Strike];

  return (
    <main
      style={{ padding: '6rem' }}
      className={`flex min-h-screen w-full h-full flex-col items-center justify-between p-24 ${inter.className}`}
    >
      <div className="w-full h-full">
        <YooptaEditor<YooptaValue>
          value={editorValue}
          onChange={(val) => setEditorValue(val)}
          plugins={plugins}
          marks={marks}
          placeholder="Start typing..."
          offline="yoopta-editor-data"
          autoFocus
          // tools={{
          //   Toolbar: <Toolbar type="bubble" />,
          //   ActionMenu: <ActionMenu />,
          // }}
        />
      </div>
    </main>
  );
}
