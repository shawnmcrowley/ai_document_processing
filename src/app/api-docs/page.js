import React from 'react';
import ReactSwagger from '@/components/next-swagger';
import swaggerSpec from '@/app/configs/swaggerConfig';
import Landing from '@/components/landing';

export default function Docs() {
  return (
    <Landing>
      <section className="bg-white pt-8 rounded-2xl" style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        paddingBottom: "2rem",
        paddingLeft: "2rem",
        paddingRight: "2rem"
      }}>
        <ReactSwagger spec={swaggerSpec} />
      </section>
    </Landing>
  );
}
