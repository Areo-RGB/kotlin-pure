import React from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Activity, Timer, Zap, Heart, Hash } from "lucide-react";
import { MenuCard } from "../components/Ui/MenuCard";
import { Header } from "../components/Ui/Header";

const Tools: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-950 flex flex-col">
      <Header title="Available Tools" onBack={() => navigate("/")} />

      <div className="flex flex-col gap-4 p-6">
        <MenuCard
          onClick={() => navigate("/motion-gate")}
          title="Motion Gate"
          description="Optical Tripwire & Timing Systems"
          icon={<Eye size={24} />}
          colorClass="bg-indigo-500"
        />

        <MenuCard
          onClick={() => navigate("/body-pose")}
          title="BodyPose"
          description="Real-time Skeletal Tracking"
          icon={<Activity size={24} />}
          colorClass="bg-blue-500"
        />

        <MenuCard
          onClick={() => navigate("/yoyo")}
          title="Yo-Yo IR1"
          description="Intermittent Recovery Test"
          icon={<Timer size={24} />}
          colorClass="bg-orange-500"
        />

        <MenuCard
          onClick={() => navigate("/sprint-duels")}
          title="Sprint Duels"
          description="Duel Randomizer"
          icon={<Zap size={24} />}
          colorClass="bg-yellow-500"
        />

        <MenuCard
          onClick={() => navigate("/life-pool")}
          title="Life Pool"
          description="Motion-activated Time Bank"
          icon={<Heart size={24} />}
          colorClass="bg-pink-500"
        />

        <MenuCard
          onClick={() => navigate("/motion-counter")}
          title="Motion Counter"
          description="Camera-based Rep Counter"
          icon={<Hash size={24} />}
          colorClass="bg-amber-500"
        />
      </div>
    </div>
  );
};

export default Tools;
