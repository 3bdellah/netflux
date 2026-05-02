import React from 'react';
import { Mail, MessageSquare, MapPin } from 'lucide-react';
import SEO from '../components/SEO';

export default function Contact() {
  return (
    <div className="w-full flex flex-col items-center gap-12">
      <SEO 
        title="Contact Us | NetFlux Support"
        description="Have questions about your speed test results or our platform? Reach out to the NetFlux team for support and feedback."
      />

      <div className="w-full max-w-4xl py-12">
        <h1 className="text-5xl font-extralight tracking-tighter mb-6">Get in <span className="text-sky-400">Touch</span></h1>
        <p className="text-slate-400 text-lg mb-12 max-w-2xl">
          We're constantly working to improve NetFlux. Whether you have technical feedback or a business inquiry, we'd love to hear from you.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-white/[0.02] border border-white/5 p-8 rounded-3xl">
            <h2 className="text-xl font-medium mb-8">Send a Message</h2>
            <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-[2px] text-slate-500 font-bold">Full Name</label>
                <input type="text" className="bg-white/[0.05] border border-white/10 rounded-xl p-4 text-sm focus:border-sky-400 outline-none transition-all" placeholder="John Doe" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-[2px] text-slate-500 font-bold">Email Address</label>
                <input type="email" className="bg-white/[0.05] border border-white/10 rounded-xl p-4 text-sm focus:border-sky-400 outline-none transition-all" placeholder="john@example.com" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-[2px] text-slate-500 font-bold">Message</label>
                <textarea rows={4} className="bg-white/[0.05] border border-white/10 rounded-xl p-4 text-sm focus:border-sky-400 outline-none transition-all resize-none" placeholder="How can we help?"></textarea>
              </div>
              <button className="bg-sky-500 text-slate-950 font-bold py-4 rounded-xl hover:bg-sky-400 transition-all">
                SEND MESSAGE
              </button>
            </form>
          </div>

          {/* Contact Info */}
          <div className="flex flex-col gap-8">
            <ContactItem 
              icon={<Mail size={20} className="text-sky-400" />}
              title="Email Us"
              value="support@netflux.io"
              description="For general inquiries and technical support."
            />
            <ContactItem 
              icon={<MessageSquare size={20} className="text-sky-400" />}
              title="Press & Media"
              value="press@netflux.io"
              description="Media kits and interview requests."
            />
            <ContactItem 
              icon={<MapPin size={20} className="text-sky-400" />}
              title="Headquarters"
              value="Frankfurt, Germany"
              description="Located in the heart of Europe's data hub."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactItem({ icon, title, value, description }: { icon: React.ReactNode, title: string, value: string, description: string }) {
  return (
    <div className="flex gap-6 p-6 bg-white/[0.01] border border-white/5 rounded-2xl hover:border-sky-400/20 transition-all">
      <div className="w-12 h-12 rounded-xl bg-sky-400/10 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-slate-500 text-[10px] uppercase tracking-[2px] font-bold mb-1">{title}</h3>
        <p className="text-white font-medium mb-1">{value}</p>
        <p className="text-slate-400 text-xs">{description}</p>
      </div>
    </div>
  );
}
