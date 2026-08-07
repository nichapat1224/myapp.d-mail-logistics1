import React, { useState, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { db } from './firebase';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  setDoc,
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1534569324356964352/1rvOo8ssGWLqzmSTw9mtB-Zun3pyuqgnT1GkHWJaHXU4_p4pJuswsJGLimqdsKag-fMC";

const THAI_PROVINCES = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", 
  "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", 
  "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", 
  "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", 
  "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", 
  "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", 
  "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", 
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", 
  "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"
];

const generateTrackingId = () => 'DM' + Math.floor(10000000 + Math.random() * 90000000) + 'TH';

export default function App() {
  const auth = getAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'Admin' หรือ 'User'
  const [authLoading, setAuthLoading] = useState(true);

  // Auth States
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Dashboard States
  const [parcels, setParcels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [toast, setToast] = useState('');

  const [selectedProvince, setSelectedProvince] = useState('กรุงเทพมหานคร');
  const [addressDetail, setAddressDetail] = useState('');
  
  const [formData, setFormData] = useState({
    trackingId: generateTrackingId(),
    recipient: '',
    phone: '',
    status: 'รับฝากชำระแล้ว'
  });
  const [formLoading, setFormLoading] = useState(false);

  // ตรวจสอบการเข้าสู่ระบบและ Role จาก Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists() && userSnap.data().role) {
            setUserRole(userSnap.data().role);
            setShowRoleSelector(false);
          } else {
            // ถ้ายังไม่มี Role ใน DB ให้แสดงหน้าเลือก
            setShowRoleSelector(true);
          }
        } catch (e) {
          console.error("Error fetching user role:", e);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setShowRoleSelector(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // ดึงรายการพัสดุ Real-time
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "parcels"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const parcelList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setParcels(parcelList);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (isRegistering) {
      if (password !== confirmPassword) {
        setAuthError('❌ รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        return;
      }
      if (password.length < 6) {
        setAuthError('❌ รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
        return;
      }
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (err) {
        setAuthError(err.code === 'auth/email-already-in-use' ? '❌ อีเมลนี้ถูกใช้งานแล้ว' : '❌ เกิดข้อผิดพลาดในการลงทะเบียน');
      }
    } else {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        setAuthError('❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    }
  };

  // ✅ ฟังก์ชันเลือก Role ฉบับแก้ไขชัวร์ 100%
  const handleSelectRole = async (selectedRole) => {
    if (!currentUser) return;
    
    // Force State เปลี่ยนทันที ไม่ต้องรอ Async เพื่อความเร็วในการ Render
    setUserRole(selectedRole);
    setShowRoleSelector(false);

    try {
      // บันทึกลง Firestore
      await setDoc(doc(db, "users", currentUser.uid), {
        email: currentUser.email,
        role: selectedRole,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast(`🎉 เข้าสู่ระบบในฐานะ [${selectedRole}] เรียบร้อยแล้ว!`);
    } catch (e) {
      console.error("Error saving role:", e);
      showToast('❌ ไม่สามารถบันทึกสิทธิ์ลงฐานข้อมูลได้');
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setShowRoleSelector(false);
    signOut(auth);
  };

  const sendDiscordNotification = async (title, parcelData, color = 3447003) => {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: title,
            color: color,
            fields: [
              { name: '📦 Tracking ID', value: `\`${parcelData.trackingId}\``, inline: true },
              { name: '👤 ผู้รับ', value: parcelData.recipient, inline: true },
              { name: '📞 เบอร์โทร', value: parcelData.phone || 'ไม่ระบุ', inline: true },
              { name: '📍 ปลายทาง', value: parcelData.location, inline: false },
              { name: '🚚 สถานะปัจจุบัน', value: `**${parcelData.status}**`, inline: false },
              { name: '👨‍💻 ผู้ทำรายการ', value: `${currentUser?.email} (${userRole})`, inline: false }
            ],
            footer: { text: 'D-MAIL LOGISTICS Notification System' },
            timestamp: new Date().toISOString()
          }]
        })
      });
    } catch (error) {
      console.error("Discord Notification Error:", error);
    }
  };

  const printLabel = (item) => {
    const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (typeof JsBarcode === 'function') {
      JsBarcode(svgNode, item.trackingId, { format: "CODE128", width: 2, height: 45, displayValue: true });
    }

    const trackUrl = `${window.location.origin}/track?id=${item.trackingId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(trackUrl)}`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const pri = iframe.contentWindow;
    pri.document.open();
    pri.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ใบปะหน้าพัสดุ - ${item.trackingId}</title>
          <style>
            body { font-family: sans-serif; padding: 15px; text-align: center; border: 2px dashed #000; margin: 10px; }
            h2 { font-size: 20px; margin-bottom: 2px; }
            .barcode { margin: 10px 0; display: flex; justify-content: center; }
            .barcode svg { width: 100%; max-width: 280px; height: auto; }
            .content-grid { display: flex; justify-content: space-between; text-align: left; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 13px; line-height: 1.5; }
            .qr-box { text-align: center; margin-left: 10px; }
            .qr-box img { width: 85px; height: 85px; }
            .qr-text { font-size: 9px; color: #555; margin-top: 2px; }
          </style>
        </head>
        <body>
          <h2>D-MAIL LOGISTICS</h2>
          <p style="margin-top:0; font-size:11px; color:#555;">ใบปะหน้าพัสดุด่วนพิเศษ</p>
          <div class="barcode">${svgNode.outerHTML}</div>
          <div class="content-grid">
            <div>
              <p><strong>Tracking ID:</strong> ${item.trackingId}</p>
              <p><strong>ผู้รับ:</strong> ${item.recipient} (${item.phone || 'ไม่ระบุเบอร์'})</p>
              <p><strong>ปลายทาง:</strong> ${item.location}</p>
              <p><strong>สถานะ:</strong> ${item.status}</p>
            </div>
            <div class="qr-box">
              <img src="${qrCodeUrl}" alt="QR Tracking" />
              <div class="qr-text">สแกนเช็กสถานะ</div>
            </div>
          </div>
        </body>
      </html>
    `);
    pri.document.close();

    setTimeout(() => {
      pri.focus();
      pri.print();
      document.body.removeChild(iframe);
    }, 600);
  };

  const handleSaveAndPrint = async (e) => {
    e.preventDefault();
    if (userRole !== 'Admin') {
      showToast('❌ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่บันทึกข้อมูลได้');
      return;
    }

    if (!formData.recipient || !addressDetail) {
      showToast('⚠️ กรุณากรอกข้อมูลผู้รับและรายละเอียดที่อยู่ให้ครบถ้วน');
      return;
    }

    const fullLocation = `${addressDetail} จ.${selectedProvince}`;
    const newParcelData = {
      trackingId: formData.trackingId,
      recipient: formData.recipient,
      phone: formData.phone,
      location: fullLocation,
      status: formData.status,
      createdBy: currentUser.email
    };

    setFormLoading(true);
    try {
      await addDoc(collection(db, "parcels"), { ...newParcelData, createdAt: serverTimestamp() });
      sendDiscordNotification("📦 ลงทะเบียนพัสดุใหม่แล้ว!", newParcelData, 3066993);
      printLabel(newParcelData);
      showToast('✅ บันทึกข้อมูลสำเร็จ!');
      
      setFormData({ trackingId: generateTrackingId(), recipient: '', phone: '', status: 'รับฝากชำระแล้ว' });
      setAddressDetail('');
      setSelectedProvince('กรุงเทพมหานคร');
    } catch (error) {
      showToast('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateStatus = async (item, newStatus) => {
    if (userRole !== 'Admin') {
      showToast('❌ เฉพาะ Admin เท่านั้นที่เปลี่ยนสถานะได้');
      return;
    }
    try {
      await updateDoc(doc(db, "parcels", item.id), { status: newStatus });
      sendDiscordNotification("🔄 อัปเดตสถานะพัสดุ!", { ...item, status: newStatus }, 3447003);
      showToast('อัปเดตสถานะพัสดุแล้ว');
    } catch (error) {
      showToast('ไม่สามารถอัปเดตสถานะได้');
    }
  };

  const handleDeleteParcel = async (id, trackingId) => {
    if (userRole !== 'Admin') {
      showToast('❌ เฉพาะ Admin เท่านั้นที่ลบพัสดุได้');
      return;
    }
    if (window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบพัสดุเลข ${trackingId}?`)) {
      try {
        await deleteDoc(doc(db, "parcels", id));
        showToast('🗑️ ลบรายการพัสดุเรียบร้อย');
      } catch (error) {
        showToast('เกิดข้อผิดพลาดในการลบ');
      }
    }
  };

  const exportToCSV = () => {
    if (parcels.length === 0) {
      showToast('ไม่มีข้อมูลให้ Export');
      return;
    }

    let csvContent = "\uFEFFTracking ID,ผู้รับ,เบอร์โทร,ที่อยู่ปลายทาง,สถานะ,ผู้ลงทะเบียน,วันที่บันทึก\n";
    filteredParcels.forEach(p => {
      const dateStr = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleString('th-TH') : '-';
      csvContent += `"${p.trackingId}","${p.recipient}","${p.phone || ''}","${p.location}","${p.status}","${p.createdBy || '-'}","${dateStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `D-MAIL_History_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📊 ส่งออกไฟล์ CSV เรียบร้อยแล้ว');
  };

  const stats = {
    total: parcels.length,
    pending: parcels.filter(p => p.status === 'รับฝากชำระแล้ว').length,
    delivering: parcels.filter(p => p.status === 'กำลังจัดส่ง' || p.status === 'อยู่ระหว่างการนำจ่าย').length,
    success: parcels.filter(p => p.status === 'จัดส่งสำเร็จ').length,
  };

  const filteredParcels = parcels.filter(p => {
    const matchesSearch = 
      p.trackingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone && p.phone.includes(searchTerm));
    
    const matchesStatus = statusFilter === 'ทั้งหมด' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (authLoading) {
    return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-cyan-400 font-mono">กำลังโหลดระบบ...</div>;
  }

  // --- หน้า LOGIN / REGISTER ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#111319] text-white flex flex-col justify-center items-center p-4 font-sans">
        <div className="w-full max-w-md bg-[#181a20] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black tracking-wider text-white">
              D-MAIL <span className="text-cyan-400">LOGISTICS</span>
            </h1>
            <p className="text-sm text-gray-400 mt-2">
              {isRegistering ? 'สร้างบัญชีผู้ใช้งานใหม่' : 'เข้าสู่ระบบจัดการพัสดุ'}
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium">อีเมลผู้ใช้งาน</label>
              <input 
                type="email" required placeholder="example@dmail.com" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#111319] border border-gray-700/80 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium">รหัสผ่าน</label>
              <input 
                type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#111319] border border-gray-700/80 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            {isRegistering && (
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">ยืนยันรหัสผ่าน</label>
                <input 
                  type="password" required placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#111319] border border-gray-700/80 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}

            <button type="submit" className="w-full bg-cyan-400 hover:bg-cyan-500 text-gray-900 font-bold py-3.5 rounded-xl transition cursor-pointer text-sm mt-2">
              {isRegistering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-400">
            {isRegistering ? (
              <p>มีบัญชีอยู่แล้ว? <button type="button" onClick={() => { setIsRegistering(false); setAuthError(''); }} className="text-cyan-400 font-bold ml-1">เข้าสู่ระบบ</button></p>
            ) : (
              <p>ยังไม่มีบัญชีผู้ใช้งาน? <button type="button" onClick={() => { setIsRegistering(true); setAuthError(''); }} className="text-cyan-400 font-bold ml-1">สมัครสมาชิกใหม่</button></p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- หน้าเลือกรอบแรก (ROLE SELECTOR) ---
  if (showRoleSelector || !userRole) {
    return (
      <div className="min-h-screen bg-[#060810] text-white flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-lg bg-[#121829] border border-cyan-500/30 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div>
            <span className="bg-cyan-500/10 text-cyan-400 text-xs font-bold px-3 py-1 rounded-full border border-cyan-500/20">
              สิทธิ์การใช้งาน
            </span>
            <h2 className="text-2xl font-bold mt-3 text-white">เลือกประเภทการเข้าใช้งาน</h2>
            <p className="text-xs text-gray-400 mt-1">กรุณาคลิกเลือกบทบาทที่ต้องการใช้งาน ({currentUser.email})</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* ปุ่มเลือก ADMIN */}
            <button
              type="button"
              onClick={() => handleSelectRole('Admin')}
              className="p-5 bg-[#182035] hover:bg-cyan-950/50 border border-cyan-500/40 hover:border-cyan-400 rounded-2xl text-left transition duration-200 group cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="text-3xl mb-2">⚡</div>
                <div className="font-bold text-cyan-400 group-hover:text-cyan-300 text-base">ผู้ดูแลระบบ (Admin)</div>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  ดู Analytics Dashboard, เพิ่มพัสดุ, พิมพ์ใบปะหน้า, เปลี่ยนสถานะ และลบข้อมูลได้
                </p>
              </div>
              <div className="mt-4 text-xs font-bold text-cyan-400 flex items-center gap-1">
                คลิกเลือก Admin ➔
              </div>
            </button>

            {/* ปุ่มเลือก USER */}
            <button
              type="button"
              onClick={() => handleSelectRole('User')}
              className="p-5 bg-[#182035] hover:bg-emerald-950/50 border border-emerald-500/40 hover:border-emerald-400 rounded-2xl text-left transition duration-200 group cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="text-3xl mb-2">👤</div>
                <div className="font-bold text-emerald-400 group-hover:text-emerald-300 text-base">ผู้ใช้งานทั่วไป (User)</div>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  ค้นหา Tracking, ตรวจสอบสถานะ และดูประวัติรายการย้อนหลัง
                </p>
              </div>
              <div className="mt-4 text-xs font-bold text-emerald-400 flex items-center gap-1">
                คลิกเลือก User ➔
              </div>
            </button>
          </div>

          <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-300 underline cursor-pointer">
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  // --- หน้าจอหลัก DASHBOARD ---
  return (
    <div className="p-8 bg-[#060810] min-h-screen text-white relative font-sans">
      {toast && (
        <div className="fixed top-5 right-5 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-2xl z-50 animate-bounce text-sm font-medium border border-blue-400">
          {toast}
        </div>
      )}

      {/* Top Navbar */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">D-MAIL Logistics Portal</h1>
          <p className="text-xs text-gray-400">
            {userRole === 'Admin' ? 'ระบบผู้ดูแลระบบ (Admin Control Center)' : 'ระบบติดตามพัสดุสำหรับผู้ใช้งานทั่วไป'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#121829] border border-gray-800 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${userRole === 'Admin' ? 'bg-cyan-400' : 'bg-emerald-500'} animate-pulse`}></span>
            <span className="text-gray-300 font-medium">{currentUser.email}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
              userRole === 'Admin' 
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' 
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}>
              {userRole}
            </span>
          </div>

          <button 
            onClick={() => setShowRoleSelector(true)} 
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer border border-gray-700"
          >
            🔄 สลับ Role
          </button>

          <button onClick={handleLogout} className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer">
            🚪 ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* ==================== แดชบอร์ด & ฟอร์มบันทึก สำหรับ ADMIN ==================== */}
        {userRole === 'Admin' && (
          <>
            {/* STATS OVERVIEW DASHBOARD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#121829] border border-gray-800 p-4 rounded-xl">
                <div className="text-xs text-gray-400 font-medium">พัสดุทั้งหมดในระบบ</div>
                <div className="text-2xl font-black text-white mt-1">{stats.total} <span className="text-xs font-normal text-gray-400">รายการ</span></div>
              </div>
              <div className="bg-[#121829] border border-gray-800 p-4 rounded-xl">
                <div className="text-xs text-amber-400 font-medium">รอการจัดส่ง (รับฝากแล้ว)</div>
                <div className="text-2xl font-black text-amber-400 mt-1">{stats.pending} <span className="text-xs font-normal text-gray-400">รายการ</span></div>
              </div>
              <div className="bg-[#121829] border border-gray-800 p-4 rounded-xl">
                <div className="text-xs text-blue-400 font-medium">อยู่ระหว่างการนำจ่าย</div>
                <div className="text-2xl font-black text-blue-400 mt-1">{stats.delivering} <span className="text-xs font-normal text-gray-400">รายการ</span></div>
              </div>
              <div className="bg-[#121829] border border-gray-800 p-4 rounded-xl">
                <div className="text-xs text-emerald-400 font-medium">จัดส่งสำเร็จเรียบร้อย</div>
                <div className="text-2xl font-black text-emerald-400 mt-1">{stats.success} <span className="text-xs font-normal text-gray-400">รายการ</span></div>
              </div>
            </div>

            {/* ฟอร์มลงทะเบียนพัสดุ */}
            <div className="bg-[#121829] p-6 rounded-xl border border-gray-800 shadow-lg">
              <h2 className="text-lg font-bold mb-4 text-cyan-400">➕ ลงทะเบียนรับฝากพัสดุใหม่ (Admin Control)</h2>
              <form onSubmit={handleSaveAndPrint} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">เลข Tracking ID (ระบบสุ่มให้อัตโนมัติ)</label>
                  <input type="text" value={formData.trackingId} readOnly className="w-full bg-[#090d16] border border-gray-800 rounded p-2 text-sm text-cyan-400 font-mono font-bold cursor-not-allowed select-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ชื่อ-นามสกุล ผู้รับ</label>
                  <input type="text" placeholder="คุณสมชาย ใจดี" value={formData.recipient} onChange={(e) => setFormData({ ...formData, recipient: e.target.value })} className="w-full bg-[#060810] border border-gray-700 rounded p-2 text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">เบอร์โทรศัพท์ผู้รับ</label>
                  <input type="tel" placeholder="0812345678" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-[#060810] border border-gray-700 rounded p-2 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">จังหวัดปลายทาง (77 จังหวัด)</label>
                  <select value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)} className="w-full bg-[#060810] border border-gray-700 rounded p-2 text-sm text-white">
                    {THAI_PROVINCES.map((prov) => <option key={prov} value={prov}>{prov}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">รายละเอียดที่อยู่ (บ้านเลขที่ / ถนน / ซอย / ตำบล / อำเภอ)</label>
                  <input type="text" placeholder="กรอกรายละเอียดที่อยู่..." value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} className="w-full bg-[#060810] border border-gray-700 rounded p-2 text-sm text-white" required />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" disabled={formLoading} className="w-full bg-cyan-500 hover:bg-cyan-600 text-gray-950 font-bold py-2.5 rounded-lg transition cursor-pointer disabled:opacity-50 text-sm">
                    {formLoading ? 'กำลังบันทึก...' : 'บันทึกลงฐานข้อมูลและพิมพ์ใบปะหน้า'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* Notice สำหรับ USER */}
        {userRole !== 'Admin' && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-amber-300 text-xs text-center">
            🔒 บัญชีของคุณคือ <strong>ผู้ใช้งานทั่วไป (User)</strong> — สามารถค้นหาและตรวจสอบประวัติพัสดุได้อย่างเดียว (หากต้องการสิทธิ์ Admin ให้กดปุ่ม "🔄 สลับ Role" ด้านบน)
          </div>
        )}

        {/* ตารางค้นหาและประวัติย้อนหลัง */}
        <div className="bg-[#121829] p-6 rounded-xl border border-gray-800 shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">📜 ค้นหาและตรวจสอบประวัติย้อนหลัง ({filteredParcels.length})</h2>
              <p className="text-xs text-gray-400">ค้นหาได้จาก เลข Tracking, ชื่อผู้รับ, หรือ เบอร์โทรศัพท์</p>
            </div>
            {userRole === 'Admin' && (
              <button onClick={exportToCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-2 rounded-lg transition font-medium cursor-pointer">
                📥 Export ประวัติ CSV
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input 
              type="text" 
              placeholder="🔍 พิมพ์เลข Tracking / ชื่อ / เบอร์โทร เพื่อค้นหาย้อนหลัง..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="md:col-span-2 bg-[#060810] border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#060810] border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="ทั้งหมด">กรองสถานะ: ทั้งหมด</option>
              <option value="รับฝากชำระแล้ว">รับฝากชำระแล้ว</option>
              <option value="กำลังจัดส่ง">กำลังจัดส่ง</option>
              <option value="อยู่ระหว่างการนำจ่าย">อยู่ระหว่างการนำจ่าย</option>
              <option value="จัดส่งสำเร็จ">จัดส่งสำเร็จ</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#060810] text-gray-400 uppercase text-xs">
                <tr>
                  <th className="p-3">Tracking ID</th>
                  <th className="p-3">วันที่ / ผู้ลงทะเบียน</th>
                  <th className="p-3">ผู้รับ / เบอร์โทร</th>
                  <th className="p-3">ปลายทาง</th>
                  <th className="p-3">สถานะ</th>
                  {userRole === 'Admin' && <th className="p-3 text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredParcels.length === 0 ? (
                  <tr>
                    <td colSpan={userRole === 'Admin' ? "6" : "5"} className="p-6 text-center text-gray-500">
                      ไม่พบข้อมูลประวัติพัสดุที่ตรงกับคำค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredParcels.map((item) => (
                    <tr key={item.id} className="hover:bg-[#1a2238] transition">
                      <td className="p-3 font-mono font-bold text-cyan-400">{item.trackingId}</td>
                      <td className="p-3 text-xs">
                        <div className="text-gray-300">{item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString('th-TH') : 'ไม่ระบุเวลา'}</div>
                        <div className="text-gray-500">{item.createdBy || '-'}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-white">{item.recipient}</div>
                        <div className="text-xs text-gray-500">{item.phone || '-'}</div>
                      </td>
                      <td className="p-3 max-w-xs truncate">{item.location}</td>
                      <td className="p-3">
                        {userRole === 'Admin' ? (
                          <select 
                            value={item.status} 
                            onChange={(e) => handleUpdateStatus(item, e.target.value)}
                            className="bg-[#060810] border border-gray-700 text-xs rounded p-1.5 text-white focus:outline-none focus:border-cyan-400"
                          >
                            <option value="รับฝากชำระแล้ว">รับฝากชำระแล้ว</option>
                            <option value="กำลังจัดส่ง">กำลังจัดส่ง</option>
                            <option value="อยู่ระหว่างการนำจ่าย">อยู่ระหว่างการนำจ่าย</option>
                            <option value="จัดส่งสำเร็จ">จัดส่งสำเร็จ</option>
                          </select>
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {item.status}
                          </span>
                        )}
                      </td>
                      {userRole === 'Admin' && (
                        <td className="p-3 text-center space-x-2">
                          <button onClick={() => printLabel(item)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2.5 py-1.5 rounded transition cursor-pointer">
                            🖨️ พิมพ์
                          </button>
                          <button onClick={() => handleDeleteParcel(item.id, item.trackingId)} className="bg-red-900/40 hover:bg-red-800/60 text-red-300 text-xs px-2.5 py-1.5 rounded transition cursor-pointer">
                            🗑️ ลบ
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
