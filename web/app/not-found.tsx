import Link from "next/link";
import "./console.css";

export default function NotFound() {
  return (
    <main className="con">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Nothing watched here</h1>
            <p>Argus has no record at this address. The investigation may not have started yet, or the link has a typo.</p>
          </div>
        </div>
        <p style={{ marginTop: 28 }}><Link className="btn btn-light btn-sm" href="/investigations">See all investigations</Link></p>
      </div>
    </main>
  );
}
