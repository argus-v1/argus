/** A painting band at the top of a console page: always dark (`ink`), title over the art, credit in the corner. */
export function PageHero({
  art,
  position = "50% 40%",
  credit,
  children,
  tall = false,
}: {
  art: string;
  position?: string;
  credit: string;
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <section className={`phero ink${tall ? " tall" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" style={{ objectPosition: position }} />
      <div className="wrap phero-in">{children}</div>
      <p className="credit">{credit}</p>
    </section>
  );
}
