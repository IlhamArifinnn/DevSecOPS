import { useEffect, useState } from 'react'

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID')

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request gagal'), { status: res.status })
  return data
}

function useForm(init) {
  const [v, setV] = useState(init)
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) })
  return [v, bind, setV]
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(sessionStorage.getItem('session') || 'null'))
  const [view, setView] = useState('products')
  const [msg, setMsg] = useState(null)

  const saveSession = (s) => {
    s ? sessionStorage.setItem('session', JSON.stringify(s)) : sessionStorage.removeItem('session')
    setSession(s)
  }
  // Semua request lewat sini: tampilkan error & auto-logout bila session habis
  const call = async (path, opts = {}) => {
    try {
      setMsg(null)
      return await api(path, { ...opts, token: session?.token })
    } catch (e) {
      if (e.status === 401 && session) { saveSession(null); setView('login') }
      setMsg({ err: true, text: e.message })
      throw e
    }
  }
  const logout = async () => {
    await call('/auth/logout', { method: 'POST' }).catch(() => {})
    saveSession(null)
    setView('products')
  }

  const ctx = { call, session, saveSession, setView, setMsg }
  const views = {
    products: <Products {...ctx} />,
    login: <Login {...ctx} />,
    register: <Register {...ctx} />,
    cart: <Cart {...ctx} />,
    orders: <Orders {...ctx} />,
    admin: <Admin {...ctx} />,
  }

  return (
    <>
      <nav>
        <strong>Toko Online</strong>
        <button onClick={() => setView('products')}>Produk</button>
        {session && <button onClick={() => setView('cart')}>Keranjang</button>}
        {session && <button onClick={() => setView('orders')}>Pesanan</button>}
        {session?.user.role === 'admin' && <button onClick={() => setView('admin')}>Admin</button>}
        <span className="spacer" />
        {session
          ? <>{session.user.name} <button onClick={logout}>Logout</button></>
          : <><button onClick={() => setView('login')}>Login</button><button onClick={() => setView('register')}>Daftar</button></>}
      </nav>
      {msg && <p className={'msg' + (msg.err ? ' err' : '')}>{msg.text}</p>}
      {views[view]}
    </>
  )
}

function Products({ call, session, setView, setMsg }) {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const load = () => call('/products?q=' + encodeURIComponent(q)).then(setItems)
  useEffect(() => { load() }, [])

  const add = async (p) => {
    if (!session) return setView('login')
    const cart = await call('/cart')
    const qty = (cart.find((c) => c.id === p.id)?.qty || 0) + 1
    await call('/cart', { method: 'PUT', body: { productId: p.id, qty } })
    setMsg({ text: `${p.name} ditambahkan ke keranjang` })
  }

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); load() }} style={{ display: 'flex', gap: 8, maxWidth: 'none' }}>
        <input placeholder="Cari produk..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button>Cari</button>
      </form>
      <div className="grid">
        {items.map((p) => (
          <div className="card" key={p.id}>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <p><b>{rupiah(p.price)}</b> · stok {p.stock}</p>
            <button disabled={!p.stock} onClick={() => add(p)}>+ Keranjang</button>
          </div>
        ))}
      </div>
    </>
  )
}

function Login({ call, saveSession, setView }) {
  const [v, bind] = useForm({ email: '', password: '' })
  const submit = async (e) => {
    e.preventDefault()
    saveSession(await call('/auth/login', { method: 'POST', body: v }))
    setView('products')
  }
  return (
    <form onSubmit={submit}>
      <h2>Login</h2>
      <input type="email" placeholder="Email" required {...bind('email')} />
      <input type="password" placeholder="Password" required {...bind('password')} />
      <button>Login</button>
    </form>
  )
}

function Register({ call, setView, setMsg }) {
  const [v, bind] = useForm({ name: '', email: '', password: '', otp: '' })
  const [sent, setSent] = useState(false)
  const register = async (e) => {
    e.preventDefault()
    await call('/auth/register', { method: 'POST', body: v })
    setSent(true)
    setMsg({ text: 'OTP dikirim ke email (dev: cek Mailpit http://localhost:8025)' })
  }
  const verify = async (e) => {
    e.preventDefault()
    await call('/auth/verify', { method: 'POST', body: { email: v.email, otp: v.otp } })
    setMsg({ text: 'Akun terverifikasi, silakan login' })
    setView('login')
  }
  return sent ? (
    <form onSubmit={verify}>
      <h2>Verifikasi OTP</h2>
      <input placeholder="6 digit OTP" required pattern="\d{6}" {...bind('otp')} />
      <button>Verifikasi</button>
    </form>
  ) : (
    <form onSubmit={register}>
      <h2>Daftar</h2>
      <input placeholder="Nama" required {...bind('name')} />
      <input type="email" placeholder="Email" required {...bind('email')} />
      <input type="password" placeholder="Password (min 8)" required minLength={8} {...bind('password')} />
      <button>Daftar</button>
    </form>
  )
}

function Cart({ call, setView, setMsg }) {
  const [items, setItems] = useState([])
  const load = () => call('/cart').then(setItems)
  useEffect(() => { load() }, [])

  const setQty = async (productId, qty) => {
    await call('/cart', { method: 'PUT', body: { productId, qty } })
    load()
  }
  const checkout = async () => {
    const order = await call('/checkout', { method: 'POST' })
    if (order.payment_url) return (window.location.href = order.payment_url)
    setMsg({ text: `Order ${order.code} dibuat (mode mock). Simulasikan bayar: npm run webhook -- ${order.code} ${order.total}` })
    setView('orders')
  }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0)

  if (!items.length) return <p>Keranjang kosong.</p>
  return (
    <>
      <table>
        <thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>{rupiah(i.price)}</td>
              <td>
                <button onClick={() => setQty(i.id, i.qty - 1)}>-</button> {i.qty}{' '}
                <button onClick={() => setQty(i.id, i.qty + 1)}>+</button>
              </td>
              <td>{rupiah(i.price * i.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Total: {rupiah(total)}</h3>
      <button onClick={checkout}>Checkout & Bayar</button>
    </>
  )
}

function OrderTable({ orders, showEmail }) {
  return (
    <table>
      <thead><tr><th>Kode</th>{showEmail && <th>Customer</th>}<th>Item</th><th>Total</th><th>Status</th><th>Tanggal</th></tr></thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{o.code}</td>
            {showEmail && <td>{o.email}</td>}
            <td>{o.items.map((i) => `${i.name} x${i.qty}`).join(', ')}</td>
            <td>{rupiah(o.total)}</td>
            <td>
              {o.status}
              {o.status === 'pending' && o.payment_url && <> · <a href={o.payment_url}>Bayar</a></>}
            </td>
            <td>{new Date(o.created_at).toLocaleString('id-ID')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Orders({ call }) {
  const [orders, setOrders] = useState([])
  useEffect(() => { call('/orders').then(setOrders) }, [])
  return <><h2>Riwayat Pesanan</h2><OrderTable orders={orders} /></>
}

function Admin({ call, setMsg }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [report, setReport] = useState(null)
  const empty = { id: null, name: '', description: '', price: '', stock: '' }
  const [v, bind, setV] = useForm(empty)

  const load = () => {
    call('/products').then(setProducts)
    call('/admin/orders').then(setOrders)
    call('/admin/reports').then(setReport)
  }
  useEffect(() => { load() }, [])

  const save = async (e) => {
    e.preventDefault()
    await call('/admin/products' + (v.id ? '/' + v.id : ''), { method: v.id ? 'PUT' : 'POST', body: v })
    setMsg({ text: 'Produk disimpan' })
    setV(empty)
    load()
  }
  const remove = async (id) => {
    if (!window.confirm('Hapus produk?')) return
    await call('/admin/products/' + id, { method: 'DELETE' })
    load()
  }

  return (
    <>
      <h2>Kelola Produk</h2>
      <form onSubmit={save}>
        <input placeholder="Nama" required {...bind('name')} />
        <textarea placeholder="Deskripsi" {...bind('description')} />
        <input type="number" min="0" placeholder="Harga" required {...bind('price')} />
        <input type="number" min="0" step="1" placeholder="Stok" required {...bind('stock')} />
        <button>{v.id ? 'Update' : 'Tambah'}</button> {v.id && <button type="button" onClick={() => setV(empty)}>Batal</button>}
      </form>
      <table>
        <thead><tr><th>Nama</th><th>Harga</th><th>Stok</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{rupiah(p.price)}</td><td>{p.stock}</td>
              <td>
                <button onClick={() => setV({ ...p, description: p.description || '' })}>Edit</button>{' '}
                <button onClick={() => remove(p.id)}>Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Laporan Transaksi</h2>
      {report && (
        <table>
          <thead><tr><th>Status</th><th>Jumlah Order</th><th>Total</th></tr></thead>
          <tbody>
            {report.byStatus.map((r) => <tr key={r.status}><td>{r.status}</td><td>{r.count}</td><td>{rupiah(r.total)}</td></tr>)}
          </tbody>
        </table>
      )}

      <h2>Semua Order</h2>
      <OrderTable orders={orders} showEmail />
    </>
  )
}
